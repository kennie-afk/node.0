#!/usr/bin/env bash
# Restore drill: proves a backup can actually be restored, into a throwaway Postgres, and that what comes back is sound.
#
#   scripts/restore-drill.sh backups/hazina-20261006-020000.dump
#
# Checks (any failure exits non-zero):
#   1. the checksum file matches
#   2. pg_restore completes with no error
#   3. every migration file this checkout ships is recorded as applied
#   4. every table with an org_id has row level security enabled AND forced
#   5. every journal entry balances and has all the lines it declared (the ledger's own invariant)
#   6. with SOURCE_CONTAINER set, row counts of the main tables equal the live database's
# Run it on a schedule (monthly at least) and after every change of Postgres version. The scratch container is removed at the end.
set -euo pipefail

dump="${1:?usage: scripts/restore-drill.sh <dump file>}"
SCRATCH="${DRILL_CONTAINER:-hazina-restore-drill}"
DB_USER="${POSTGRES_USER:-hazina}"
DB_NAME="${POSTGRES_DB:-hazina}"
PORT="${DRILL_PORT:-55499}"
root="$(cd "$(dirname "$0")/.." && pwd)"

fail() { echo "DRILL FAILED: $*" >&2; exit 1; }
cleanup() { docker rm -f "$SCRATCH" >/dev/null 2>&1 || true; }
trap cleanup EXIT

if [ -f "$dump.sha256" ]; then
  ( cd "$(dirname "$dump")" && sha256sum -c "$(basename "$dump").sha256" >/dev/null ) || fail "checksum does not match"
  echo "checksum ok"
fi

cleanup
docker run -d --name "$SCRATCH" -e POSTGRES_USER="$DB_USER" -e POSTGRES_PASSWORD=drill -e POSTGRES_DB="$DB_NAME" -p "127.0.0.1:$PORT:5432" postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$SCRATCH" pg_isready -U "$DB_USER" >/dev/null 2>&1 && break; sleep 1; done
sleep 2

q() { docker exec "$SCRATCH" psql -U "$DB_USER" -d "$DB_NAME" -Atc "$1"; }

# roles are not part of a database dump; the app role must exist before its grants are restored
docker exec "$SCRATCH" psql -U "$DB_USER" -d "$DB_NAME" -qc "CREATE ROLE hazina_app NOSUPERUSER NOBYPASSRLS LOGIN" >/dev/null
docker exec -i "$SCRATCH" pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --exit-on-error < "$dump" || fail "pg_restore reported an error"
echo "restore ok"

shipped=$(ls "$root"/migrations/*.sql | wc -l | tr -d ' ')
applied=$(q "SELECT count(*) FROM schema_migrations")
[ "$applied" -ge "$shipped" ] || fail "only $applied of $shipped shipped migrations are recorded as applied (the backup predates this checkout, or is incomplete)"
echo "migrations ok ($applied applied)"

bad=$(q "SELECT string_agg(c.relname, ', ') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public' JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped WHERE c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)")
[ -z "$bad" ] || fail "tables without forced row level security after restore: $bad"
echo "row level security ok"

unbalanced=$(q "SELECT count(*) FROM (SELECT e.id FROM journal_entries e JOIN journal_lines l ON l.entry_id = e.id GROUP BY e.id, e.line_count, e.total_cents HAVING count(*) <> e.line_count OR sum(l.debit_cents) <> sum(l.credit_cents) OR sum(l.debit_cents) <> e.total_cents) x")
[ "$unbalanced" = "0" ] || fail "$unbalanced journal entries are unbalanced or incomplete"
echo "ledger ok ($(q 'SELECT count(*) FROM journal_entries') entries, all balanced)"

if [ -n "${SOURCE_CONTAINER:-}" ]; then
  for t in organisations members loans loan_schedule loan_repayments journal_entries journal_lines mpesa_payments savings_txns audit_events; do
    live=$(docker exec "$SOURCE_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT count(*) FROM $t")
    back=$(q "SELECT count(*) FROM $t")
    [ "$live" = "$back" ] || fail "$t has $live rows in the live database but $back in the restore (rows written after the dump are expected to differ: run the drill right after a backup)"
  done
  echo "row counts match the live database"
fi
echo "DRILL PASSED: $dump restores cleanly"
