#!/usr/bin/env bash
# Logical backup of the Sojaa database: a custom-format pg_dump plus a SHA-256 file, written to BACKUP_DIR.
# Run from cron (for example nightly) and copy BACKUP_DIR OFF this machine: a backup on the same disk is not a backup.
#   PG_CONTAINER=sojaa-postgres-1 POSTGRES_USER=sojaa POSTGRES_DB=sojaa BACKUP_DIR=/var/backups/sojaa scripts/backup.sh
set -euo pipefail
PG_CONTAINER="${PG_CONTAINER:-sojaa-postgres-1}"
PGUSER_="${POSTGRES_USER:-sojaa}"
PGDB="${POSTGRES_DB:-sojaa}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/sojaa-$stamp.dump"
docker exec "$PG_CONTAINER" pg_dump -U "$PGUSER_" -d "$PGDB" --format=custom --no-owner > "$file.partial"
# a dump that cannot be listed is not a backup
docker exec -i "$PG_CONTAINER" pg_restore --list < "$file.partial" > /dev/null
mv "$file.partial" "$file"
( cd "$BACKUP_DIR" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256" )
# keep the newest $KEEP dumps
ls -1t "$BACKUP_DIR"/sojaa-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do rm -f "$old" "$old.sha256"; done
echo "$file"
