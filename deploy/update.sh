#!/usr/bin/env bash
# Обновление KPI-Drive на сервере одной командой: sudo bash /opt/kpi-drive/deploy/update.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kpi-drive}"
APP_USER="${APP_USER:-kpiapp}"
SERVICE="${SERVICE:-kpi-drive}"
APP_URL_DEFAULT="${APP_URL_DEFAULT:-https://kpi.raz2va.ru}"
PORT="${PORT:-4327}"

step() { printf '\n\033[1;34m▸ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
as_app() { sudo -u "$APP_USER" -H "$@"; }

[ "$(id -u)" -eq 0 ] || fail "Запустите через sudo: sudo bash $APP_DIR/deploy/update.sh"
cd "$APP_DIR"

if [ "${1:-}" != "--after-pull" ]; then
  step "Копия базы и сайта перед обновлением"
  if [ -f deploy/backup.sh ]; then
    bash deploy/backup.sh || fail "Копия не создана — обновление остановлено."
  else
    echo "Скрипта копии ещё нет — он появится после загрузки обновления."
  fi

  step "Загрузка обновления из GitHub"
  git config --global --get-all safe.directory | grep -qx "$APP_DIR" || git config --global --add safe.directory "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  as_app git checkout -- package-lock.json 2>/dev/null || true
  before="$(as_app git rev-parse HEAD)"
  as_app git pull --ff-only || fail "git pull не прошёл. Проверьте 'git status' в $APP_DIR."
  after="$(as_app git rev-parse HEAD)"
  echo "Версия: ${before:0:7} → ${after:0:7}"
  if ! git diff --quiet "$before" "$after" -- deploy/update.sh; then
    echo "Скрипт обновления изменился — продолжаем новой версией."
    BEFORE="$before" exec bash deploy/update.sh --after-pull
  fi
else
  before="${BEFORE:-}"
  after="$(as_app git rev-parse HEAD)"
fi

step "Зависимости"
if [ ! -d node_modules ] || [ -z "$before" ] || ! git diff --quiet "$before" "$after" -- package.json package-lock.json; then
  as_app npm ci --no-audit --no-fund
else
  echo "package.json не менялся — пропускаем."
fi

step "Сборка интерфейса"
as_app npm run build

step "Настройки"
if [ -f .env ] && ! grep -q '^APP_URL=' .env; then
  printf '\nAPP_URL=%s\n' "$APP_URL_DEFAULT" >> .env
  echo "Добавлен APP_URL=$APP_URL_DEFAULT — по нему строятся ссылки в письмах."
else
  echo "APP_URL: $(sed -n 's/^APP_URL=//p' .env 2>/dev/null | tail -n 1)"
fi

step "Службы systemd"
install -m 644 deploy/kpi-drive.service /etc/systemd/system/kpi-drive.service
install -m 644 deploy/kpi-drive-backup.service /etc/systemd/system/kpi-drive-backup.service
install -m 644 deploy/kpi-drive-backup.timer /etc/systemd/system/kpi-drive-backup.timer
systemctl daemon-reload
systemctl enable --now kpi-drive-backup.timer >/dev/null
echo "Ежедневная копия базы и сайта: около 03:30, хранятся 5 последних в /var/backups/kpi-drive"

step "Перезапуск"
systemctl restart "$SERVICE"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    printf '\n\033[1;32m✓ KPI-Drive обновлён и работает (%s)\033[0m\n' "$(as_app git log -1 --format='%h %s')"
    exit 0
  fi
  sleep 1
done
journalctl -u "$SERVICE" -n 40 --no-pager
fail "Сервис не ответил за 30 секунд — журнал выше. Копии базы и сайта перед обновлением лежат в /var/backups/kpi-drive."
