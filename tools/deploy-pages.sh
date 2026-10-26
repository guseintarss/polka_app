#!/usr/bin/env bash
# Публикует приложение на GitHub Pages: пересобирает dist и обновляет ветку main.
# Требуется GitHub CLI (`gh`) с выполненным входом.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${POLKA_PAGES_REPO:-guseintarss/polka-app}"
URL="${POLKA_PAGES_URL:-https://guseintarss.github.io/polka-app/}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Не найден gh. Установите GitHub CLI и выполните: gh auth login" >&2
  exit 1
fi

tools/package.sh

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
gh repo clone "$REPO" "$TMP" -- --quiet
rsync -a --delete --exclude '.git' dist/polka-app/ "$TMP"/

cd "$TMP"
if git diff --quiet && git diff --cached --quiet; then
  echo "Изменений нет — публикация не нужна."
else
  git add -A
  git -c user.name='polka-deploy' \
      -c user.email='guseintarss@users.noreply.github.com' \
      commit -m "ПОЛКА: обновление $(date '+%Y-%m-%d %H:%M')"
  git push
  echo "Отправлено в $REPO."
fi

printf 'Ждём сборку GitHub Pages'
status='pending'
for _ in $(seq 1 24); do
  status="$(gh api "repos/$REPO/pages/builds/latest" --jq '.status' 2>/dev/null || echo pending)"
  if [ "$status" = 'built' ] || [ "$status" = 'errored' ]; then break; fi
  printf '.'
  sleep 5
done
printf ' %s\n' "$status"

if [ "$status" = 'errored' ]; then
  echo "Сборка GitHub Pages упала — проверьте логи: gh api repos/$REPO/pages/builds/latest" >&2
  exit 1
fi

printf 'Проверка: '
curl -fsS -o /dev/null -w '%{http_code} %{url_effective}\n' "$URL"
