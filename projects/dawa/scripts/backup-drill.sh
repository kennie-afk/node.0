#!/usr/bin/env bash
# The backup/restore drill: take a backup, restore it into a scratch database, and PROVE the copy is usable:
#   1. every table has the same number of rows as the live database (use on a quiet system, or set DRILL_STRICT=0 to only warn)
#   2. the same migrations are recorded
#   3. row-level security is still forced on every table that has org_id
#   4. the restricted application role, connected to the copy with no tenant selected, sees no tenant rows
#   5. the application role is still not a superuser and cannot bypass RLS
# Then it drops the scratch database. Exit status is non-zero if any check fails.
#
#   scripts/backup-drill.sh [backup-dir]
#   DAWA_PG_EXEC, POSTGRES_USER, POSTGRES_DB as in backup.sh;  DAWA_APP_PASSWORD is needed for check 4;
#   KEEP_SCRATCH=1 leaves the restored database in place for a look.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="${1:-./backups}"
PG_EXEC="${DAWA_PG_EXEC:-docker compose exec -T postgres}"
PGU="${POSTGRES_USER:-dawa}"
LIVE="${POSTGRES_DB:-dawa}"
STRICT="${DRILL_STRICT:-1}"
SCRATCH="dawa_drill_$(date -u +%Y%m%d%H%M%S)"
FAILED=0
fail() { echo "FAIL: $*" >&2; FAILED=1; }
ok() { echo "ok:   $*"; }
q() { $PG_EXEC psql -U "$PGU" -d "$1" -Atq -c "$2"; }

KEEP="${KEEP:-14}" "$HERE/backup.sh" "$DIR"
DUMP="$(ls -1t "$DIR"/dawa-*.dump | head -1)"
"$HERE/restore.sh" "$DUMP" "$SCRATCH"

cleanup() { [ "${KEEP_SCRATCH:-0}" = 1 ] || q postgres "DROP DATABASE IF EXISTS \"$SCRATCH\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# 1. row counts, table by table
TABLES="$(q "$LIVE" "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")"
DIFFS=0
for t in $TABLES; do
  a="$(q "$LIVE" "SELECT count(*) FROM public.\"$t\"")"
  b="$(q "$SCRATCH" "SELECT count(*) FROM public.\"$t\"")"
  # (the Postgres owner role is a superuser, so row-level security does not hide tenant rows from these counts)
  if [ "$a" != "$b" ]; then DIFFS=$((DIFFS + 1)); echo "  differs: $t live=$a copy=$b" >&2; fi
done
if [ "$DIFFS" -eq 0 ]; then ok "all $(echo "$TABLES" | wc -w) tables have the same row counts"; elif [ "$STRICT" = 1 ]; then fail "$DIFFS table(s) differ in row count"; else echo "warn: $DIFFS table(s) differ (system was busy)"; fi

# 2. migrations
ML="$(q "$LIVE" "SELECT count(*) FROM schema_migrations")"; MC="$(q "$SCRATCH" "SELECT count(*) FROM schema_migrations")"
[ "$ML" = "$MC" ] && [ "$ML" -gt 0 ] && ok "$MC migrations recorded in the copy" || fail "migrations differ: live=$ML copy=$MC"

# 3. forced RLS on every org_id table
UNPROTECTED="$(q "$SCRATCH" "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public' JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped WHERE c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)")"
[ "$UNPROTECTED" = 0 ] && ok "row-level security is forced on every tenant table in the copy" || fail "$UNPROTECTED tenant table(s) lost forced row-level security in the copy"

# 4 and 5. the application role
BYPASS="$(q postgres "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = 'dawa_app'")"
[ "$BYPASS" = f ] && ok "dawa_app is not a superuser and cannot bypass row-level security" || fail "dawa_app can bypass row-level security"
if [ -n "${DAWA_APP_PASSWORD:-}" ]; then
  VISIBLE="$($PG_EXEC psql "postgres://dawa_app:${DAWA_APP_PASSWORD}@127.0.0.1:5432/${SCRATCH}" -Atq -c "SELECT (SELECT count(*) FROM products) + (SELECT count(*) FROM users) + (SELECT count(*) FROM sales)")"
  [ "$VISIBLE" = 0 ] && ok "the application role, with no tenant selected, sees no tenant rows in the copy" || fail "the application role saw $VISIBLE tenant rows with no tenant selected"
else
  echo "skip: set DAWA_APP_PASSWORD to check the application role against the copy"
fi

if [ "$FAILED" = 0 ]; then echo "DRILL PASSED: $DUMP restores into a working, tenant-safe copy"; else echo "DRILL FAILED" >&2; exit 1; fi
