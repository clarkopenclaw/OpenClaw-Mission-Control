#!/usr/bin/env bash
set -euo pipefail
PORT="${1:-18998}"
cd "$(dirname "$0")"
echo "Serving Mission Control at http://127.0.0.1:${PORT}/index.html"
python3 -m http.server "$PORT" --bind 127.0.0.1
