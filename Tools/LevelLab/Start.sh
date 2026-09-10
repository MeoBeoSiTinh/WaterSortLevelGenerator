#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Packaged lab root has Tools/LevelLab/server.js here.
# Source copy lives in Tools/LevelLab/, so climb to the Unity project root.
if [[ -f "Tools/LevelLab/server.js" ]]; then
  :
elif [[ -f "server.js" ]]; then
  cd ../..
else
  echo "Cannot find Tools/LevelLab/server.js. Run Start.sh from the Level Lab folder."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is missing. Install Node.js 22 or newer (https://nodejs.org), then run Start.sh again."
  exit 1
fi

MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [[ "$MAJOR" -lt 22 ]]; then
  echo "Node.js 22+ is required. Current version: $(node -v)"
  exit 1
fi

echo "Starting Water Sort Level Lab..."
echo "The browser URL is printed below. Keep this terminal open while you play."
exec node Tools/LevelLab/server.js
