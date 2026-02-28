#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$ROOT_DIR/public/data"
mkdir -p "$DATA_DIR"

# Jobs list
openclaw cron list --all --json > "$DATA_DIR/cron-jobs.json"

# Agents (for model mapping)
openclaw agents list --json > "$DATA_DIR/agents.json"

# Recent runs
# Note: `openclaw cron runs` may require a specific job id depending on OpenClaw version.
# We keep this best-effort and don't fail refresh if unsupported.
openclaw cron runs --help > "$DATA_DIR/cron-runs-help.txt" 2>&1 || true

# Timestamp
node -e 'process.stdout.write(JSON.stringify({ generatedAt: Math.floor(Date.now() / 1000) }, null, 2) + "\n")' > "$DATA_DIR/meta.json"

echo "Wrote: $DATA_DIR/cron-jobs.json"
echo "Wrote: $DATA_DIR/agents.json"
echo "Wrote: $DATA_DIR/cron-runs-help.txt" 
echo "Wrote: $DATA_DIR/meta.json"
