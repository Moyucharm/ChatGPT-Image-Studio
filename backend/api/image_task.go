package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	imageTaskStatusQueued    = "queued"
	imageTaskStatusRunning   = "running"
	imageTaskStatusSucceeded = "succeeded"
	imageTaskStatusFailed    = "failed"

	maxImageTaskEntries = 200
	imageTaskTTL        = time.Hour
)

type imageTaskEntry struct {
	ID         string         `json:"id"`
	Status     string         `json:"status"`
	CreatedAt  string         `json:"createdAt"`
	UpdatedAt  string         `json:"updatedAt"`
	FinishedAt string         `json:"finishedAt,omitempty"`
	Result     map[string]any `json:"result,omitempty"`
	Error      string         `json:"error,omitempty"`
	Code       string         `json:"code,omitempty"`
}

type imageTaskStore struct {
	mu    sync.Mutex
	sem   chan struct{}
	items map[string]*imageTaskEntry
	order []string
}

func newImageTaskStore(concurrency int) *imageTaskStore {
	if concurrency < 1 {
		concurrency = 1
	}
	return &imageTaskStore{
		sem:   make(chan struct{}, concurrency),
		items: make(map[string]*imageTaskEntry),
		order: make([]string, 0, maxImageTaskEntries),
	}
}

func (s *imageTaskStore) create() imageTaskEntry {
	now := time.Now().Format(time.RFC3339Nano)
	entry := &imageTaskEntry{
		ID:        fmt.Sprintf("imgtask_%d", time.Now().UnixNano()),
		Status:    imageTaskStatusQueued,
		CreatedAt: now,
		UpdatedAt: now,
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.items[entry.ID] = entry
	s.order = append([]string{entry.ID}, s.order...)
	s.pruneLocked(time.Now())
	return cloneImageTaskEntry(entry)
}

func (s *imageTaskStore) start(id string, timeout time.Duration, run func(context.Context) (map[string]any, error)) {
	go func() {
		s.sem <- struct{}{}
		defer func() { <-s.sem }()

		s.update(id, func(entry *imageTaskEntry) {
			entry.Status = imageTaskStatusRunning
		})

		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()

		result, err := run(ctx)
		if err != nil {
			code := requestErrorCode(err)
			s.update(id, func(entry *imageTaskEntry) {
				entry.Status = imageTaskStatusFailed
				entry.Error = err.Error()
				entry.Code = code
				entry.FinishedAt = time.Now().Format(time.RFC3339Nano)
			})
			return
		}

		s.update(id, func(entry *imageTaskEntry) {
			entry.Status = imageTaskStatusSucceeded
			entry.Result = result
			entry.FinishedAt = time.Now().Format(time.RFC3339Nano)
		})
	}()
}

func (s *imageTaskStore) get(id string) (imageTaskEntry, bool) {
	if s == nil {
		return imageTaskEntry{}, false
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.pruneLocked(time.Now())
	entry, ok := s.items[strings.TrimSpace(id)]
	if !ok {
		return imageTaskEntry{}, false
	}
	return cloneImageTaskEntry(entry), true
}

func (s *imageTaskStore) update(id string, mutate func(*imageTaskEntry)) {
	if s == nil {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	entry, ok := s.items[id]
	if !ok {
		return
	}
	mutate(entry)
	entry.UpdatedAt = time.Now().Format(time.RFC3339Nano)
	s.pruneLocked(time.Now())
}

func (s *imageTaskStore) pruneLocked(now time.Time) {
	if s == nil {
		return
	}

	kept := s.order[:0]
	for _, id := range s.order {
		entry := s.items[id]
		if entry == nil {
			continue
		}
		if len(kept) >= maxImageTaskEntries || imageTaskExpired(entry, now) {
			delete(s.items, id)
			continue
		}
		kept = append(kept, id)
	}
	s.order = kept
}

func imageTaskExpired(entry *imageTaskEntry, now time.Time) bool {
	if entry == nil || entry.FinishedAt == "" {
		return false
	}
	finishedAt, err := time.Parse(time.RFC3339Nano, entry.FinishedAt)
	if err != nil {
		return false
	}
	return now.Sub(finishedAt) > imageTaskTTL
}

func cloneImageTaskEntry(entry *imageTaskEntry) imageTaskEntry {
	if entry == nil {
		return imageTaskEntry{}
	}
	return imageTaskEntry{
		ID:         entry.ID,
		Status:     entry.Status,
		CreatedAt:  entry.CreatedAt,
		UpdatedAt:  entry.UpdatedAt,
		FinishedAt: entry.FinishedAt,
		Result:     entry.Result,
		Error:      entry.Error,
		Code:       entry.Code,
	}
}

func (s *Server) handleCreateImageGenerationTask(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Model          string `json:"model"`
		Prompt         string `json:"prompt"`
		N              int    `json:"n"`
		Size           string `json:"size"`
		Quality        string `json:"quality"`
		Background     string `json:"background"`
		ImageRoute     string `json:"image_route"`
		ResponseFormat string `json:"response_format"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid request body"})
		return
	}
	if strings.TrimSpace(req.Prompt) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "prompt is required"})
		return
	}
	if req.N < 1 {
		req.N = 1
	}

	if s.imageTasks == nil {
		s.imageTasks = newImageTaskStore(2)
	}

	entry := s.imageTasks.create()
	baseTaskRequest := r.Clone(context.Background())
	timeout := s.imageTaskTimeout()
	s.imageTasks.start(entry.ID, timeout, func(ctx context.Context) (map[string]any, error) {
		taskRequest := baseTaskRequest.Clone(ctx)
		return s.executeImageGeneration(ctx, imageGenerationRequest{
			Model:          req.Model,
			Prompt:         req.Prompt,
			N:              req.N,
			Size:           req.Size,
			Quality:        req.Quality,
			Background:     req.Background,
			ImageRoute:     req.ImageRoute,
			ResponseFormat: req.ResponseFormat,
		}, taskRequest)
	})

	writeJSON(w, http.StatusAccepted, map[string]any{"task": entry})
}

func (s *Server) handleGetImageTask(w http.ResponseWriter, r *http.Request) {
	if s.imageTasks == nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "task not found"})
		return
	}
	entry, ok := s.imageTasks.get(r.PathValue("id"))
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "task not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"task": entry})
}

func (s *Server) imageTaskTimeout() time.Duration {
	if s == nil || s.cfg == nil {
		return 10 * time.Minute
	}
	seconds := max(s.cfg.ChatGPT.SSETimeout, s.cfg.ChatGPT.PollMaxWait)
	seconds = max(seconds, s.cfg.ChatGPT.RequestTimeout)
	seconds = max(seconds, 300)
	return time.Duration(seconds+60) * time.Second
}
