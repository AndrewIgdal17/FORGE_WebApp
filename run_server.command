#!/bin/bash
# Launch FORGE web app (FastAPI + uvicorn)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

export PORT="${PORT:-8000}"
export HOST="${HOST:-127.0.0.1}"

# Ensure uv is available
if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  exit 1
fi

# Install / sync dependencies (pulls FORGE calculator from GitHub)
uv sync --quiet

LOCAL_ADDRESS="http://127.0.0.1:$PORT"

cat << 'EOF'
  _____ ___  ____   ____ _____  __        _______ ____      _    ____  ____
 |  ___/ _ \|  _ \ / ___| ____| \ \      / | ____| __ )    / \  |  _ \|  _ \
 | |_ | | | | |_) | |  _|  _|    \ \ /\ / /|  _| |  _ \   / _ \ | |_) | |_) |
 |  _|| |_| |  _ <| |_| | |___    \ V  V / | |___| |_) | / ___ \|  __/|  __/
 |_|   \___/|_| \_\\____|_____|    \_/\_/  |_____|____/ /_/   \_|_|   |_|

EOF

echo "Starting FORGE web app..."
echo "  Local: $LOCAL_ADDRESS"
echo "Press Ctrl+C to stop."
echo

(sleep 2 && open "$LOCAL_ADDRESS") &

make dev
