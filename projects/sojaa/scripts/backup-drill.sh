#!/usr/bin/env bash
# The restore drill: back up, restore into a scratch database, and compare row counts of the tables that matter. Exits non-zero on any
# difference. Run it on a schedule and after every migration that adds a table: a backup that has never been restored is a hope.
#   PG_CONTAINER=sojaa-postgres-1 POSTGRES_USER=sojaa POSTGRES_DB=sojaa scripts/backup-drill.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
PG_CONTAINER="${PG_CONTAINER:-sojaa-postgres-1}"
PGUSER_="${POSTGRES_USER:-sojaa}"
PGDB="${POSTGRES_DB:-sojaa}"
export BACKUP_DIR="${BACKUP_DIR:-$(mktemp -d)}"
scratch="drill_$(date -u +%Y%m%d%H%M%S)"
trap 'docker exec "$PG_CONTAINER" psql -U "$PGUSER_" -d postgres -qc "DROP DATABASE IF EXISTS $scratch" >/dev/null 2>&1 || true' EXIT
dump="$("$here/backup.sh")"
"$here/restore.sh" "$dump" "$scratch" >/dev/null
tables="organisations users guards shifts attendance_events payslips pay_periods client_invoices audit_events subscriptions leave_requests"
fail=0
for t in $tables; do
  a="$(docker exec "$PG_CONTAINER" psql -U "$PGUSER_" -d "$PGDB" -tAc "SELECT count(*) FROM $t")"
  b="$(docker exec "$PG_CONTAINER" psql -U "$PGUSER_" -d "$scratch" -tAc "SELECT count(*) FROM $t")"
  if [[ "$a" != "$b" ]]; then echo "MISMATCH $t: live=$a restored=$b" >&2; fail=1; else echo "ok $t $a"; fi
done
[[ $fail -eq 0 ]] && echo "drill passed: $dump restored into $scratch and matched" || { echo "drill FAILED" >&2; exit 1; }
