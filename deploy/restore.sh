#!/usr/bin/env bash
# Восстановление KPI-Drive из копии:
#   база: sudo bash deploy/restore.sh /var/backups/kpi-drive/kpi-drive-<дата>.dump
#   сайт: sudo bash deploy/restore.sh /var/backups/kpi-drive/kpi-drive-site-<дата>.tar.gz
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kpi-drive}"
APP_USER="${APP_USER:-kpiapp}"
SERVICE="${SERVICE:-kpi-drive}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/kpi-drive}"
file="${1:-}"
here="$(cd "$(dirname "$0")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите через sudo." >&2
  exit 1
fi
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "Укажите файл копии. Доступные копии (новые сверху):" >&2
  ls -1t "$BACKUP_DIR"/kpi-drive-*.dump "$BACKUP_DIR"/kpi-drive-site-*.tar.gz 2>/dev/null >&2 || echo "  копий нет" >&2
  exit 1
fi

case "$file" in
  *.dump) kind="база" ;;
  *.tar.gz) kind="сайт" ;;
  *) echo "Нужен файл .dump (база) или .tar.gz (сайт)." >&2; exit 1 ;;
esac

read -r -p "Текущий $kind будет заменён копией $(basename "$file"). Продолжить? [да/нет] " answer
if [ "$answer" != "да" ]; then
  echo "Отменено."
  exit 1
fi

echo "Снимаем копию текущего состояния на всякий случай…"
tmp_script="$(mktemp)"
cp "$here/backup.sh" "$tmp_script"
KEEP=50 bash "$tmp_script"
rm -f "$tmp_script"

systemctl stop "$SERVICE"
trap 'systemctl start "$SERVICE"' EXIT

if [ "$kind" = "база" ]; then
  if [ -z "${DATABASE_URL:-}" ] && [ -f "$APP_DIR/.env" ]; then
    DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' "$APP_DIR/.env" | tail -n 1 | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
  fi
  DATABASE_URL="${DATABASE_URL:-postgres://kpi:kpi@127.0.0.1:5432/kpi_drive}"
  pg_restore --clean --if-exists --no-owner --single-transaction --dbname="$DATABASE_URL" "$file"
  echo "База восстановлена из $file"
  exit 0
fi

parent="$(dirname "$APP_DIR")"
name="$(basename "$APP_DIR")"
previous="$APP_DIR.before-restore-$(date +%Y-%m-%d_%H%M%S)"
staging="$(mktemp -d "$parent/.restore-XXXXXX")"
tar --extract --gzip --file="$file" --directory="$staging"
[ -d "$staging/$name" ] || { echo "В архиве нет папки $name." >&2; rm -rf "$staging"; exit 1; }
mv "$APP_DIR" "$previous"
mv "$staging/$name" "$APP_DIR"
rmdir "$staging"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
echo "Ставим зависимости…"
(cd "$APP_DIR" && sudo -u "$APP_USER" -H npm ci --no-audit --no-fund)
echo "Сайт восстановлен из $file"
echo "Прежняя папка сохранена в $previous — удалите её, когда убедитесь, что всё работает."
