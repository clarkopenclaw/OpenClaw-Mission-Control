#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$ROOT_DIR/public/data"
TMP_DIR="$ROOT_DIR/.tmp/openclaw"
mkdir -p "$DATA_DIR"
mkdir -p "$TMP_DIR"
export TMPDIR="$TMP_DIR"

# Jobs list
openclaw cron list --all --json > "$DATA_DIR/cron-jobs.json"

# Agents (for model mapping)
openclaw agents list --json > "$DATA_DIR/agents.json"

# Recent runs
node "$ROOT_DIR/refresh-cron-runs.mjs" \
  "$DATA_DIR/cron-jobs.json" \
  "$DATA_DIR/cron-runs.json" \
  "$DATA_DIR/cron-runs-help.txt"

# Timestamp
node -e 'process.stdout.write(JSON.stringify({ generatedAt: Math.floor(Date.now() / 1000) }, null, 2) + "\n")' > "$DATA_DIR/meta.json"

echo "Wrote: $DATA_DIR/cron-jobs.json"
echo "Wrote: $DATA_DIR/agents.json"
echo "Wrote: $DATA_DIR/cron-runs.json"
echo "Wrote: $DATA_DIR/cron-runs-help.txt"
echo "Wrote: $DATA_DIR/meta.json"
