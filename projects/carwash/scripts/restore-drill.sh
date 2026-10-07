#!/bin/sh
# Restore drill: proves a backup can be restored, and how long it takes. Run it on a schedule (monthly is the
# minimum) and after any change to the backup. It never touches the live database: it restores into a scratch
# database on the same server and drops it afterwards.
#
#   usage:  scripts/restore-drill.sh [path/to/forecourt-....dump]      (default: the newest dump in BACKUP_DIR)
#
#   DATABASE_MIGRATION_URL   required. Must be allowed to CREATE DATABASE (the docker postgres user is).
#   BACKUP_DIR               default ./backups
#   MIGRATIONS_DIR           default ./migrations; the number of files here must equal the migrations the dump says ran
#
# What it checks, and fails on: the dump restores without error; schema_migrations in the restored copy lists every
# migration file in this checkout; every tenant table still has row level security FORCED; the core tables are there.
# It prints row counts so a human can see the data came back, and the elapsed seconds (your recovery time).
set -eu

: "${DATABASE_MIGRATION_URL:?DATABASE_MIGRATION_URL must be set (the owner connection)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-./migrations}"

dump="${1:-}"
if [ -z "$dump" ]; then
  dump="$(ls -1t "$BACKUP_DIR"/forecourt-*.dump 2>/dev/null | head -n 1 || true)"
fi
[ -n "$dump" ] && [ -f "$dump" ] || { echo "no dump to restore (looked in $BACKUP_DIR)" >&2; exit 2; }

if [ -f "$dump.sha256" ]; then
  ( cd "$(dirname "$dump")" && sha256sum -c "$(basename "$dump").sha256" > /dev/null ) || { echo "checksum does not match: the dump is damaged" >&2; exit 1; }
fi

scratch="forecourt_restore_drill_$(date -u +%Y%m%d%H%M%S)_$$"
# the same server and credentials, a different database name
scratch_url="$(printf '%s' "$DATABASE_MIGRATION_URL" | sed -E "s#/[^/?]+(\\?|\$)#/$scratch\\1#")"

cleanup() { psql "$DATABASE_MIGRATION_URL" -qAt -c "DROP DATABASE IF EXISTS $scratch" > /dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

started="$(date +%s)"
psql "$DATABASE_MIGRATION_URL" -qAt -v ON_ERROR_STOP=1 -c "CREATE DATABASE $scratch"
# roles and grants belong to the cluster, not the dump, so they are skipped: this checks the data and the schema
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$scratch_url" "$dump"
finished="$(date +%s)"

q() { psql "$scratch_url" -qAt -v ON_ERROR_STOP=1 -c "$1"; }

want="$(ls -1 "$MIGRATIONS_DIR"/*.sql | wc -l | tr -d ' ')"
have="$(q 'SELECT count(*) FROM schema_migrations')"
if [ "$want" != "$have" ]; then
  echo "FAIL: the restored database records $have migrations but this checkout has $want" >&2
  exit 1
fi
for file in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$file")"
  [ "$(q "SELECT count(*) FROM schema_migrations WHERE name = '$name'")" = "1" ] || { echo "FAIL: migration $name is missing from the restored copy" >&2; exit 1; }
done

unforced="$(q "SELECT string_agg(c.relname, ', ') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity AND NOT c.relforcerowsecurity")"
if [ -n "$unforced" ]; then
  echo "FAIL: row level security is enabled but not forced on: $unforced" >&2
  exit 1
fi
rls="$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relforcerowsecurity")"
[ "$rls" -ge 10 ] || { echo "FAIL: only $rls tables have forced row level security; expected the whole tenant schema" >&2; exit 1; }

echo "restored $dump into $scratch in $((finished - started))s"
for table in organisations sites users jobs payments discrepancies day_closes; do
  # RLS is forced for the owner role too, so a plain count may read 0 for a non-superuser; a superuser sees the truth
  printf '  %-15s %s\n' "$table" "$(q "SELECT count(*) FROM $table")"
done
echo "restore drill passed: $have migrations present, row level security forced on $rls tables"
