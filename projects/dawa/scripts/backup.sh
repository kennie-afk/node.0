#!/usr/bin/env bash
# Takes a consistent backup of the Dawa database (custom-format pg_dump, one transaction snapshot) and writes
# <dir>/dawa-<UTC timestamp>.dump plus a .sha256 beside it. Old backups beyond KEEP are deleted.
#
#   scripts/backup.sh [backup-dir]            default ./backups, KEEP=14
#
# It runs pg_dump INSIDE the Postgres container, so no client tools are needed on the host.
#   DAWA_PG_EXEC   how to run a command in that container. Default: "docker compose exec -T postgres"
#                  (with the production override use: "docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres")
#   POSTGRES_USER / POSTGRES_DB   default dawa / dawa
#
# The dump holds health information (dispensing records) and password hashes: keep it encrypted and off the same machine.
# A backup nobody has restored is a hope, not a backup: run scripts/backup-drill.sh.
set -euo pipefail

DIR="${1:-./backups}"
KEEP="${KEEP:-14}"
PG_EXEC="${DAWA_PG_EXEC:-docker compose exec -T postgres}"
PGU="${POSTGRES_USER:-dawa}"
PGDB="${POSTGRES_DB:-dawa}"

mkdir -p "$DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DIR/dawa-$STAMP.dump"
umask 077

# -Fc: compressed, restorable selectively; --no-owner/--no-privileges are NOT used, so the grants that keep the
# application role restricted come back with the data.
$PG_EXEC pg_dump -U "$PGU" -d "$PGDB" -Fc > "$OUT.partial"
[ -s "$OUT.partial" ] || { echo "backup is empty, refusing to keep it" >&2; rm -f "$OUT.partial"; exit 1; }
mv "$OUT.partial" "$OUT"
( cd "$DIR" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256" )
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"

# retention: newest KEEP dumps stay
ls -1t "$DIR"/dawa-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do rm -f "$old" "$old.sha256"; echo "removed $old"; done
