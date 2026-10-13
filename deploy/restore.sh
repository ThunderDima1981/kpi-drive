#!/usr/bin/env bash
# Восстановление базы KPI-Drive из копии: sudo bash deploy/restore.sh /var/backups/kpi-drive/kpi-drive-....dump
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kpi-drive}"
SERVICE="${SERVICE:-kpi-drive}"
dump="${1:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите через sudo." >&2
  exit 1
fi
if [ -z "$dump" ] || [ ! -f "$dump" ]; then
  echo "Укажите файл копии. Доступные копии:" >&2
  ls -1t /var/backups/kpi-drive/kpi-drive-*.dump 2>/dev/null >&2 || echo "  копий нет" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ] && [ -f "$APP_DIR/.env" ]; then
  DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' "$APP_DIR/.env" | tail -n 1 | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
fi
DATABASE_URL="${DATABASE_URL:-postgres://kpi:kpi@127.0.0.1:5432/kpi_drive}"

read -r -p "Текущие данные будут заменены копией $(basename "$dump"). Продолжить? [да/нет] " answer
if [ "$answer" != "да" ]; then
  echo "Отменено."
  exit 1
fi

echo "Снимаем копию текущего состояния на всякий случай…"
KEEP=50 bash "$(dirname "$0")/backup.sh"
systemctl stop "$SERVICE"
trap 'systemctl start "$SERVICE"' EXIT
pg_restore --clean --if-exists --no-owner --single-transaction --dbname="$DATABASE_URL" "$dump"
echo "База восстановлена из $dump"
