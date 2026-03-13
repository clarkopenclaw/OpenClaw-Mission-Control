#!/usr/bin/env bash
# Start both the task board backend (Python) and the Vite dev server.
# Usage: ./start.sh

set -e

BACKEND_DIR="$HOME/Documents/OpenClaw-Workspace"
BACKEND_CMD="python3 -m scripts.task_board.server"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "Starting task board backend on :18999..."
(cd "$BACKEND_DIR" && $BACKEND_CMD) &
BACKEND_PID=$!

# Give backend a moment to bind the port
sleep 1

echo "Starting Vite dev server on :5173..."
npm run dev &
FRONTEND_PID=$!

wait
