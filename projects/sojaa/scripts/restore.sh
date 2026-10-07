#!/usr/bin/env bash
# Restores a dump made by backup.sh into a NEW database (it refuses to touch an existing one), after checking its SHA-256.
#   scripts/restore.sh backups/sojaa-<stamp>.dump sojaa_restored
# To go live on the restored copy: stop the api, rename databases (or point DATABASE_URL at the new one), start the api.
# The roles (sojaa_app) live in the cluster, not in the dump: the migrate service recreates the role and its password on start.
set -euo pipefail
dump="${1:?usage: restore.sh <dump file> <new database name>}"
target="${2:?usage: restore.sh <dump file> <new database name>}"
PG_CONTAINER="${PG_CONTAINER:-sojaa-postgres-1}"
PGUSER_="${POSTGRES_USER:-sojaa}"
[[ "$target" =~ ^[a-z_][a-z0-9_]{0,40}$ ]] || { echo "bad database name" >&2; exit 2; }
if [[ -f "$dump.sha256" ]]; then ( cd "$(dirname "$dump")" && sha256sum -c "$(basename "$dump").sha256" ); else echo "no checksum file next to the dump; continuing without it" >&2; fi
exists="$(docker exec "$PG_CONTAINER" psql -U "$PGUSER_" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$target'")"
[[ -z "$exists" ]] || { echo "database $target already exists; choose a new name" >&2; exit 3; }
docker exec "$PG_CONTAINER" psql -U "$PGUSER_" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $target"
docker exec -i "$PG_CONTAINER" pg_restore -U "$PGUSER_" -d "$target" --no-owner --exit-on-error < "$dump"
echo "restored into $target"
