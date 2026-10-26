#!/usr/bin/env bash
# Собирает публичный дистрибутив ПОЛКИ: только файлы, нужные приложению.
# Исходники, тесты и служебные скрипты в публикацию не попадают.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-dist/polka-app}"
ZIP="${2:-dist/polka-app.zip}"

rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT"

rsync -a \
  index.html \
  manifest.webmanifest \
  sw.js \
  assets \
  css \
  js \
  "$OUT"/

# GitHub Pages: не прогонять файлы через Jekyll.
touch "$OUT/.nojekyll"

python3 - "$OUT" "$ZIP" <<'PY'
import os
import sys
import zipfile

root, archive = sys.argv[1], sys.argv[2]
os.makedirs(os.path.dirname(archive) or ".", exist_ok=True)

with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
    for base, dirs, files in os.walk(root):
        dirs.sort()
        for name in sorted(files):
            path = os.path.join(base, name)
            bundle.write(path, os.path.relpath(path, os.path.dirname(root)))
PY

printf 'Публикация: %s\nАрхив: %s\n' "$OUT" "$ZIP"
