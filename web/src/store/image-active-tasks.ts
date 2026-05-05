"use client";

import type { ImageMode } from "@/store/image-conversations";

export type ActiveImageTask = {
  conversationId: string;
  turnId: string;
  taskId?: string;
  status?: "queued" | "running";
  mode: ImageMode;
  count: number;
  variant: "standard" | "selection-edit";
  startedAt: number;
};

type Listener = () => void;

const activeTasksStorageKey = "chatgpt-image-active-tasks";
const activeTasks = new Map<string, ActiveImageTask>();
const listeners = new Set<Listener>();

function getTaskKey(conversationId: string, turnId: string) {
  return `${conversationId}:${turnId}`;
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function normalizeTask(task: ActiveImageTask): ActiveImageTask | null {
  const conversationId = String(task?.conversationId || "").trim();
  const turnId = String(task?.turnId || "").trim();
  if (!conversationId || !turnId) {
    return null;
  }
  return {
    conversationId,
    turnId,
    taskId: String(task.taskId || "").trim() || undefined,
    status:
      task.status === "queued" || task.status === "running"
        ? task.status
        : undefined,
    mode:
      task.mode === "edit" || task.mode === "upscale" ? task.mode : "generate",
    count: Math.max(1, Number(task.count) || 1),
    variant: task.variant === "selection-edit" ? "selection-edit" : "standard",
    startedAt: Number(task.startedAt) || Date.now(),
  };
}

function persistActiveTasks() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      activeTasksStorageKey,
      JSON.stringify(
        Array.from(activeTasks.values()).filter((task) => task.taskId),
      ),
    );
  } catch {
    // localStorage may be unavailable in private contexts.
  }
}

function loadPersistedActiveTasks() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const raw = window.localStorage.getItem(activeTasksStorageKey);
    const items = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) {
      return;
    }
    items.forEach((item) => {
      const task = normalizeTask(item as ActiveImageTask);
      if (task) {
        activeTasks.set(getTaskKey(task.conversationId, task.turnId), task);
      }
    });
  } catch {
    activeTasks.clear();
  }
}

loadPersistedActiveTasks();

export function startImageTask(task: ActiveImageTask) {
  const normalized = normalizeTask(task);
  if (!normalized) {
    return;
  }
  activeTasks.set(
    getTaskKey(normalized.conversationId, normalized.turnId),
    normalized,
  );
  persistActiveTasks();
  notifyListeners();
}

export function finishImageTask(conversationId: string, turnId: string) {
  activeTasks.delete(getTaskKey(conversationId, turnId));
  persistActiveTasks();
  notifyListeners();
}

export function updateImageTaskStatus(
  conversationId: string,
  turnId: string,
  status: ActiveImageTask["status"],
  taskId?: string,
) {
  const key = getTaskKey(conversationId, turnId);
  const task = activeTasks.get(key);
  if (!task) {
    return;
  }
  activeTasks.set(key, {
    ...task,
    taskId: String(taskId || task.taskId || "").trim() || undefined,
    status,
  });
  persistActiveTasks();
  notifyListeners();
}

export function isImageTaskActive(conversationId: string, turnId: string) {
  return activeTasks.has(getTaskKey(conversationId, turnId));
}

export function listActiveImageTasks() {
  return Array.from(activeTasks.values()).sort(
    (a, b) => b.startedAt - a.startedAt,
  );
}

export function subscribeImageTasks(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
