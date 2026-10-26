#!/usr/bin/env bash
# Локальный сервер для проверки PWA.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${1:-8766}"
echo "ПОЛКА: http://127.0.0.1:${PORT}/"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
