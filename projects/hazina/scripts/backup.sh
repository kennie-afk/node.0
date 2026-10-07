#!/usr/bin/env bash
# Logical backup of the Hazina database: a custom-format pg_dump, a checksum, and pruning of old copies.
#
#   scripts/backup.sh                 # writes backups/hazina-YYYYmmdd-HHMMSS.dump (+ .sha256)
#   BACKUP_KEEP=14 BACKUP_DIR=/mnt/backups scripts/backup.sh
#
# The dump MUST run as a role that bypasses row level security (the compose POSTGRES_USER is a superuser): every tenant table
# has forced RLS, so a dump taken as the restricted app role would silently contain no rows. The script refuses to continue if it
# cannot see data it knows exists. Copy the dump off the machine (and test it with scripts/restore-drill.sh): a backup that
# lives on the same disk, or was never restored, is not a backup.
set -euo pipefail

CONTAINER="${HAZINA_PG_CONTAINER:-hazina-postgres-1}"
DB_USER="${POSTGRES_USER:-hazina}"
DB_NAME="${POSTGRES_DB:-hazina}"
DIR="${BACKUP_DIR:-backups}"
KEEP="${BACKUP_KEEP:-14}"

mkdir -p "$DIR"
stamp="$(date -u +%Y%m%d-%H%M%S)"
file="$DIR/hazina-$stamp.dump"

# RLS guard: the dumping role must see the tenant tables' rows (organisations is RLS-protected too).
bypass="$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user")"
if [ "$bypass" != "t" ]; then
  echo "refusing to back up: $DB_USER does not bypass row level security, so the dump would be empty" >&2
  exit 1
fi

docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --compress=6 --no-owner > "$file.partial"
mv "$file.partial" "$file"
( cd "$DIR" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256" )
echo "wrote $file ($(du -h "$file" | cut -f1))"

# keep the newest $KEEP dumps
ls -1t "$DIR"/hazina-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old" "$old.sha256"
  echo "pruned $old"
done
