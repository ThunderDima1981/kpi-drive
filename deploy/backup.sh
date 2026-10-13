#!/usr/bin/env bash
# Копия базы KPI-Drive. Хранит KEEP последних файлов, старые удаляет.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kpi-drive}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/kpi-drive}"
KEEP="${KEEP:-5}"

if [ -z "${DATABASE_URL:-}" ] && [ -f "$APP_DIR/.env" ]; then
  DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' "$APP_DIR/.env" | tail -n 1 | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
fi
DATABASE_URL="${DATABASE_URL:-postgres://kpi:kpi@127.0.0.1:5432/kpi_drive}"

umask 077
mkdir -p "$BACKUP_DIR"
target="$BACKUP_DIR/kpi-drive-$(date +%Y-%m-%d_%H%M%S).dump"

pg_dump --format=custom --no-owner --file="$target.part" "$DATABASE_URL"
mv "$target.part" "$target"

find "$BACKUP_DIR" -maxdepth 1 -name 'kpi-drive-*.dump' -printf '%T@ %p\n' \
  | sort -rn | tail -n +"$((KEEP + 1))" | cut -d' ' -f2- | xargs -r rm -f --

echo "Копия базы: $target ($(du -h "$target" | cut -f1))"
echo "Хранится копий: $(find "$BACKUP_DIR" -maxdepth 1 -name 'kpi-drive-*.dump' | wc -l) из $KEEP"
