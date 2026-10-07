#!/bin/sh
# Forecourt database backup: one compressed pg_dump, written atomically, verified, and old ones pruned.
#
#   DATABASE_MIGRATION_URL   required. The OWNER connection. It must be a superuser or have BYPASSRLS, because
#                            every tenant table has FORCED row level security and pg_dump refuses (rather than
#                            silently dumping nothing) when a role would be filtered by it. The application role
#                            cannot be used for this, on purpose.
#   BACKUP_DIR               where dumps go (default ./backups)
#   BACKUP_KEEP_DAYS         delete dumps older than this (default 14)
#   BACKUP_SKIP_RAW_TELEMETRY=1  leave out the raw telemetry partitions (the bulk of the volume). The per-minute
#                            and per-hour tables, and every other table, are still dumped. Raw readings are only
#                            used for the device-silent check on recent days.
#
# Exit status is non-zero if the dump fails or cannot be read back: a backup nobody can restore is not a backup.
set -eu

: "${DATABASE_MIGRATION_URL:?DATABASE_MIGRATION_URL must be set (the owner connection)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$BACKUP_DIR/forecourt-$stamp.dump"
partial="$final.partial"
trap 'rm -f "$partial"' EXIT INT TERM

if [ "${BACKUP_SKIP_RAW_TELEMETRY:-0}" = "1" ]; then
  pg_dump --format=custom --compress=6 --no-sync \
    --exclude-table-data='telemetry' --exclude-table-data='telemetry_[0-9]*' \
    --file="$partial" "$DATABASE_MIGRATION_URL"
else
  pg_dump --format=custom --compress=6 --no-sync --file="$partial" "$DATABASE_MIGRATION_URL"
fi

# the archive must be readable end to end, and must contain the table that says which migrations ran
pg_restore --list "$partial" > /dev/null
pg_restore --list "$partial" | grep -q 'TABLE DATA public schema_migrations' || {
  echo "backup is missing schema_migrations; refusing to keep it" >&2
  exit 1
}

mv "$partial" "$final"
trap - EXIT INT TERM
( cd "$BACKUP_DIR" && sha256sum "$(basename "$final")" > "$(basename "$final").sha256" )
echo "backup written: $final ($(wc -c < "$final") bytes)"

# prune, never touching the one just written
find "$BACKUP_DIR" -maxdepth 1 -name 'forecourt-*.dump*' -type f -mtime +"$BACKUP_KEEP_DAYS" ! -name "$(basename "$final")*" -exec rm -f {} +
