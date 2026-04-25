package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"chatgpt2api/internal/accounts"
	"chatgpt2api/internal/config"
)

func TestShouldUseOfficialResponses(t *testing.T) {
	tests := []struct {
		name              string
		preferredAccount  bool
		responsesEligible bool
		configuredRoute   string
		want              bool
	}{
		{
			name:              "paid account with eligible request uses responses",
			responsesEligible: true,
			configuredRoute:   "responses",
			want:              true,
		},
		{
			name:              "paid account with ineligible payload stays legacy",
			responsesEligible: false,
			configuredRoute:   "responses",
			want:              false,
		},
		{
			name:              "preferred source account stays legacy",
			preferredAccount:  true,
			responsesEligible: true,
			configuredRoute:   "responses",
			want:              false,
		},
		{
			name:              "legacy route stays legacy",
			responsesEligible: true,
			configuredRoute:   "legacy",
			want:              false,
		},
		{
			name:              "unknown route falls back to legacy",
			responsesEligible: true,
			configuredRoute:   "something-else",
			want:              false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldUseOfficialResponses(tt.preferredAccount, tt.responsesEligible, tt.configuredRoute); got != tt.want {
				t.Fatalf("shouldUseOfficialResponses() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestConfiguredImageRoute(t *testing.T) {
	server := &Server{
		cfg: &config.Config{
			ChatGPT: config.ChatGPTConfig{
				FreeImageRoute: "responses",
				PaidImageRoute: "legacy",
			},
		},
	}

	if got := server.configuredImageRoute("Free"); got != "responses" {
		t.Fatalf("configuredImageRoute(Free) = %q, want %q", got, "responses")
	}
	if got := server.configuredImageRoute("Plus"); got != "legacy" {
		t.Fatalf("configuredImageRoute(Plus) = %q, want %q", got, "legacy")
	}
}

func TestConfiguredImageModeTreatsLegacyMixAsStudio(t *testing.T) {
	server := &Server{
		cfg: &config.Config{
			ChatGPT: config.ChatGPTConfig{
				ImageMode: "mix",
			},
		},
	}

	if got := server.configuredImageMode(); got != "studio" {
		t.Fatalf("configuredImageMode() = %q, want %q", got, "studio")
	}
}

func TestResolveImageUpstreamModelFromConfig(t *testing.T) {
	server := &Server{
		cfg: &config.Config{
			ChatGPT: config.ChatGPTConfig{
				FreeImageModel: "auto",
				PaidImageModel: "gpt-5.4",
			},
		},
	}

	if got := server.resolveImageUpstreamModel("gpt-image-1", "Plus"); got != "gpt-5.4" {
		t.Fatalf("resolveImageUpstreamModel() = %q, want %q", got, "gpt-5.4")
	}
	if got := server.resolveImageUpstreamModel("gpt-image-2", "Free"); got != "auto" {
		t.Fatalf("resolveImageUpstreamModel() = %q, want %q", got, "auto")
	}
}

func TestHandleLoginReturnsGuestRoleWhenGuestPasswordMatches(t *testing.T) {
	server := &Server{
		cfg: &config.Config{
			App: config.AppConfig{AuthKey: "admin-key"},
			Guest: config.GuestConfig{
				Password: "guest-key",
			},
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
	req.Header.Set("Authorization", "Bearer guest-key")
	rec := httptest.NewRecorder()

	server.handleLogin(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var payload struct {
		OK      bool   `json:"ok"`
		Role    string `json:"role"`
		Version string `json:"version"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	if !payload.OK {
		t.Fatal("expected ok=true")
	}
	if payload.Role != "guest" {
		t.Fatalf("role = %q, want guest", payload.Role)
	}
}

func TestHandleLoginRejectsGuestWhenPasswordUnset(t *testing.T) {
	server := &Server{
		cfg: &config.Config{
			App: config.AppConfig{AuthKey: "admin-key"},
			Guest: config.GuestConfig{
				Password: "",
			},
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
	req.Header.Set("Authorization", "Bearer guest-key")
	rec := httptest.NewRecorder()

	server.handleLogin(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestImageAuthAllowsGuestButUIAuthDoesNot(t *testing.T) {
	server := &Server{
		cfg: &config.Config{
			App: config.AppConfig{AuthKey: "admin-key", APIKey: "api-key"},
			Guest: config.GuestConfig{
				Password: "guest-key",
			},
		},
	}

	guestReq := httptest.NewRequest(http.MethodGet, "/api/image/bootstrap", nil)
	guestReq.Header.Set("Authorization", "Bearer guest-key")

	imageRec := httptest.NewRecorder()
	server.requireImageAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(imageRec, guestReq)
	if imageRec.Code != http.StatusOK {
		t.Fatalf("image auth status = %d, body = %s", imageRec.Code, imageRec.Body.String())
	}

	uiRec := httptest.NewRecorder()
	server.requireUIAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(uiRec, guestReq)
	if uiRec.Code != http.StatusUnauthorized {
		t.Fatalf("ui auth status = %d, body = %s", uiRec.Code, uiRec.Body.String())
	}
}

func TestIsImageAccountUsableUsesQuotaInsteadOfLimitsProgress(t *testing.T) {
	account := accounts.PublicAccount{
		Status: "正常",
		Quota:  5,
		LimitsProgress: []map[string]any{
			{
				"feature_name": "image_gen",
				"remaining":    0,
			},
		},
	}

	if !isImageAccountUsable(account, false) {
		t.Fatal("expected account to stay usable when quota is positive")
	}
}

func TestResolveImageAcquireError(t *testing.T) {
	lastErr := errors.New("refresh failed")
	noAvailableErr := errors.New("read dir failed")

	tests := []struct {
		name             string
		mode             string
		err              error
		lastRetryableErr error
		wantMessage      string
		wantCode         string
	}{
		{
			name:        "cpa mode still maps empty pool when helper is used",
			mode:        "cpa",
			err:         accounts.ErrNoAvailableImageAuth,
			wantMessage: "当前没有可用的图片账号用于 CPA 模式",
			wantCode:    "no_cpa_image_accounts",
		},
		{
			name:             "retry exhaustion keeps last real error",
			mode:             "cpa",
			err:              accounts.ErrNoAvailableImageAuth,
			lastRetryableErr: lastErr,
			wantMessage:      lastErr.Error(),
		},
		{
			name:        "non sentinel error passes through",
			mode:        "cpa",
			err:         noAvailableErr,
			wantMessage: noAvailableErr.Error(),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resolveImageAcquireError(tt.mode, tt.err, tt.lastRetryableErr)
			if got == nil {
				t.Fatal("resolveImageAcquireError() returned nil")
			}
			if got.Error() != tt.wantMessage {
				t.Fatalf("resolveImageAcquireError() error = %q, want %q", got.Error(), tt.wantMessage)
			}
			if tt.wantCode != "" && requestErrorCode(got) != tt.wantCode {
				t.Fatalf("resolveImageAcquireError() code = %q, want %q", requestErrorCode(got), tt.wantCode)
			}
		})
	}
}

func TestNormalizeGenerateImageSize(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "empty size uses default upstream behavior",
			input: "",
			want:  "",
		},
		{
			name:  "supported landscape size passes through",
			input: "1536x1024",
			want:  "1536x1024",
		},
		{
			name:  "uppercase separator is normalized",
			input: "1024X1536",
			want:  "1024x1536",
		},
		{
			name:  "unsupported large size now passes through normalized",
			input: "8192x8192",
			want:  "8192x8192",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeGenerateImageSize(tt.input)
			if got != tt.want {
				t.Fatalf("normalizeGenerateImageSize() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestStudioPaidResolutionUsesPaidAccount(t *testing.T) {
	server, recorder := newImageModeCompatTestServerWithOptions(t, imageModeCompatScenario{
		imageMode:   "studio",
		accountType: "Plus",
		freeRoute:   "legacy",
		freeModel:   "auto",
		paidRoute:   "responses",
		paidModel:   "gpt-5.4-mini",
	}, compatTestServerOptions{
		accounts: []compatSeedAccount{
			{
				fileName:    "free.json",
				accessToken: "token-free-priority",
				accountType: "Free",
				priority:    100,
				quota:       5,
				status:      "正常",
			},
			{
				fileName:    "paid.json",
				accessToken: "token-paid",
				accountType: "Plus",
				priority:    1,
				quota:       5,
				status:      "正常",
			},
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"test prompt","size":"2560x1440","quality":"high","response_format":"b64_json"}`))
	req.Header.Set("Authorization", "Bearer "+server.cfg.App.APIKey)
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	entries := server.reqLogs.list(1)
	if len(entries) != 1 {
		t.Fatalf("log entries = %d, want 1", len(entries))
	}
	entry := entries[0]
	if entry.AccountType != "Plus" {
		t.Fatalf("account type = %q, want %q", entry.AccountType, "Plus")
	}
	if entry.Size != "2560x1440" {
		t.Fatalf("log size = %q, want %q", entry.Size, "2560x1440")
	}
	if entry.Quality != "high" {
		t.Fatalf("log quality = %q, want %q", entry.Quality, "high")
	}
	if entry.PromptLength != 11 {
		t.Fatalf("log prompt length = %d, want 11", entry.PromptLength)
	}
	if recorder.lastFactory != "responses" {
		t.Fatalf("last factory = %q, want %q", recorder.lastFactory, "responses")
	}
	if got := recorder.callSequence[len(recorder.callSequence)-1]; !strings.Contains(got, "token-paid") {
		t.Fatalf("call sequence = %v, want paid token selected", recorder.callSequence)
	}
}
