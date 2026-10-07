#!/usr/bin/env bash
# Restores a backup made by scripts/backup.sh into a NEW database. It never overwrites a database that exists: to recover
# production, restore to a new name, check it (scripts/backup-drill.sh does), then point the API at it (POSTGRES_DB) or
# rename databases while the API is stopped.
#
#   scripts/restore.sh <dump file> <new database name>
#
#   DAWA_PG_EXEC          as in backup.sh
#   DAWA_APP_PASSWORD     password to (re)set on the restricted role dawa_app, if the role has to be created
set -euo pipefail

DUMP="${1:?usage: restore.sh <dump file> <new database name>}"
TARGET="${2:?usage: restore.sh <dump file> <new database name>}"
PG_EXEC="${DAWA_PG_EXEC:-docker compose exec -T postgres}"
PGU="${POSTGRES_USER:-dawa}"
[[ "$TARGET" =~ ^[a-zA-Z0-9_]+$ ]] || { echo "database name must be letters, digits, underscore" >&2; exit 1; }
[ -f "$DUMP" ] || { echo "no such file: $DUMP" >&2; exit 1; }

if [ -f "$DUMP.sha256" ]; then
  ( cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256" ) || { echo "checksum does not match: the backup is damaged" >&2; exit 1; }
fi

EXISTS="$($PG_EXEC psql -U "$PGU" -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$TARGET'")"
[ -z "$EXISTS" ] || { echo "database $TARGET already exists; choose a new name (this script never overwrites)" >&2; exit 1; }

# The restricted role is cluster-wide, so a fresh cluster does not have it. NOSUPERUSER NOBYPASSRLS is the point of it.
$PG_EXEC psql -U "$PGU" -d postgres -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dawa_app') THEN
    CREATE ROLE dawa_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN;
  END IF;
END \$\$;
SQL
if [ -n "${DAWA_APP_PASSWORD:-}" ]; then
  $PG_EXEC psql -U "$PGU" -d postgres -v ON_ERROR_STOP=1 -q -c "ALTER ROLE dawa_app PASSWORD '${DAWA_APP_PASSWORD//\'/\'\'}'"
fi

$PG_EXEC psql -U "$PGU" -d postgres -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$TARGET\" OWNER \"$PGU\""
# --exit-on-error: a restore that half worked must say so
$PG_EXEC pg_restore -U "$PGU" -d "$TARGET" --exit-on-error --no-owner --role="$PGU" < "$DUMP"
echo "restored $DUMP into database $TARGET"
