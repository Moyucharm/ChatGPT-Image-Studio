#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$REPO_ROOT/web"
BACKEND_DIR="$REPO_ROOT/backend"

echo "[1/3] Building frontend static assets..."
cd "$WEB_DIR"
npm ci
npm run build

echo "[2/3] Watching frontend changes and auto-syncing to backend/static..."
npm run build:watch > "$WEB_DIR/vite-watch.out.log" 2> "$WEB_DIR/vite-watch.err.log" &
WATCH_PID=$!
trap 'kill $WATCH_PID 2>/dev/null || true' EXIT INT TERM
sleep 2
if ! kill -0 "$WATCH_PID" 2>/dev/null; then
  echo "frontend watcher exited early, see $WEB_DIR/vite-watch.err.log" >&2
  exit 1
fi

echo "[3/3] Starting backend on configured port..."
cd "$BACKEND_DIR"
SERVER_PORT=7001 go run .
