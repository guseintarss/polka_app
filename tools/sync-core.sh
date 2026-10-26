#!/usr/bin/env bash
# Копирует общее ядро из сайта ПОЛКА в приложение.
# Использование: tools/sync-core.sh [путь-к-сайту]
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${1:-../polka}"

if [[ ! -f "$SRC/js/engine.js" || ! -f "$SRC/js/data.js" ]]; then
  echo "Не нашёл ядро в '$SRC'. Укажите путь к папке сайта polka." >&2
  exit 1
fi

cp "$SRC/js/data.js" js/data.js
cp "$SRC/js/engine.js" js/engine.js
cp "$SRC/tests/engine.test.js" tests/engine.test.js
cp -r "$SRC/assets/fonts/." assets/fonts/
cp "$SRC/assets/fonts.css" assets/fonts.css
cp "$SRC/assets/favicon.svg" assets/favicon.svg

echo "Ядро и шрифты синхронизированы из $SRC."
echo "Не забудьте поднять VERSION в sw.js, если ассеты изменились."
