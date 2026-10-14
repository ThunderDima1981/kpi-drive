#!/usr/bin/env bash
# Копия KPI-Drive: база (pg_dump) и папка сайта (tar.gz без node_modules).
# Хранит KEEP последних копий каждого вида, старые удаляет.
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
stamp="$(date +%Y-%m-%d_%H%M%S)"
while [ -e "$BACKUP_DIR/kpi-drive-$stamp.dump" ] || [ -e "$BACKUP_DIR/kpi-drive-site-$stamp.tar.gz" ]; do
  sleep 1
  stamp="$(date +%Y-%m-%d_%H%M%S)"
done
dump="$BACKUP_DIR/kpi-drive-$stamp.dump"
site="$BACKUP_DIR/kpi-drive-site-$stamp.tar.gz"

pg_dump --format=custom --no-owner --file="$dump.part" "$DATABASE_URL"
mv "$dump.part" "$dump"

if [ -d "$APP_DIR" ]; then
  tar --create --gzip --file="$site.part" \
    --directory="$(dirname "$APP_DIR")" \
    --exclude="$(basename "$APP_DIR")/node_modules" \
    "$(basename "$APP_DIR")"
  mv "$site.part" "$site"
fi

prune() {
  find "$BACKUP_DIR" -maxdepth 1 -name "$1" -printf '%T@ %p\n' \
    | sort -rn | tail -n +"$((KEEP + 1))" | cut -d' ' -f2- | xargs -r rm -f --
}
prune 'kpi-drive-[0-9]*.dump'
prune 'kpi-drive-site-*.tar.gz'

echo "Копия базы:  $dump ($(du -h "$dump" | cut -f1))"
[ -f "$site" ] && echo "Копия сайта: $site ($(du -h "$site" | cut -f1))"
echo "Хранится копий: база $(find "$BACKUP_DIR" -maxdepth 1 -name 'kpi-drive-[0-9]*.dump' | wc -l), сайт $(find "$BACKUP_DIR" -maxdepth 1 -name 'kpi-drive-site-*.tar.gz' | wc -l) — не больше $KEEP каждого вида"
