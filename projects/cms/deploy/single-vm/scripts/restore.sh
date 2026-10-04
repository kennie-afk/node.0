#!/usr/bin/env bash
# Restore a dump made by backup.sh.
#   ./restore.sh --drill <dump>        restore into a throwaway database, check it, drop it. Touches nothing live.
#   ./restore.sh --live  <dump> --yes  REPLACE the live database with the dump (stops api/worker first).
# The drill is how you find out a backup works BEFORE you need it. Do it after setup and every month.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
DC="docker compose -p "${COMPOSE_PROJECT:-cms}" -f docker-compose.prod.yml --env-file .env"
MODE="${1:-}"; DUMP="${2:-}"; [ -f "$DUMP" ] || { sed -n 2,6p "$0"; exit 2; }
psql_owner() { $DC exec -T postgres psql -U "$POSTGRES_USER" -v ON_ERROR_STOP=1 -At "$@"; }

restore_into() {   # $1 = database name (must already exist and be empty)
  # The dump carries the table grants for the application role but not the role itself: make sure it exists
  # first, or the restore stops at the first GRANT. Re-applied afterwards for its per-role limits.
  ./scripts/ensure-app-role.sh
  # --no-owner: objects belong to the connecting owner role, as in a normal install.
  $DC exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --exit-on-error < "$DUMP"
}

case "$MODE" in
  --drill)
    DB="cms_restore_drill"
    psql_owner -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
    restore_into "$DB"
    echo "-- sanity checks on the restored copy"
    psql_owner -d "$DB" -c "SELECT 'churches', count(*) FROM churches UNION ALL SELECT 'members', count(*) FROM members UNION ALL SELECT 'journal_entries', count(*) FROM journal_entries UNION ALL SELECT 'users', count(*) FROM users"
    pol="$(psql_owner -d "$DB" -c "SELECT count(*) FROM pg_policies WHERE schemaname='public'")"
    enabled="$(psql_owner -d "$DB" -c "SELECT count(*) FROM pg_class WHERE relrowsecurity AND relnamespace='public'::regnamespace")"
    echo "row-level-security policies: $pol   tables with RLS enabled: $enabled"
    [ "$pol" -gt 0 ] && [ "$enabled" -gt 0 ] || { echo "DRILL FAILED: security policies missing from the restored copy" >&2; psql_owner -d postgres -c "DROP DATABASE $DB"; exit 1; }
    # The thing that matters: the RESTRICTED application role can connect to the restored copy, sees nothing
    # with no church set, and sees exactly one church's rows once a church is set.
    church="$(psql_owner -d "$DB" -c "SELECT church_id FROM members GROUP BY church_id ORDER BY count(*) DESC LIMIT 1")"
    app_psql() { $DC exec -T -e PGPASSWORD="$APP_DB_PASSWORD" postgres psql -h 127.0.0.1 -U "${APP_DB_USER:-cms_app}" -d "$DB" -v ON_ERROR_STOP=1 -At "$@"; }
    none="$(app_psql -c "SELECT count(*) FROM members")"
    mine="$(app_psql -c "BEGIN" -c "SELECT set_config('app.church_id','$church',true)" -c "SELECT count(*) FROM members" -c "ROLLBACK" | sed -n 3p)"
    echo "as the application role: members visible with no church set = $none, with church $church set = $mine"
    [ "$none" = "0" ] && [ "${mine:-0}" -gt 0 ] || { echo "DRILL FAILED: row-level security does not behave on the restored copy" >&2; psql_owner -d postgres -c "DROP DATABASE $DB"; exit 1; }
    psql_owner -d "$DB" -c "SELECT 'ledger chain heads', count(*) FROM finance_chain"
    psql_owner -d postgres -c "DROP DATABASE $DB"
    echo "RESTORE DRILL PASSED for $DUMP"
    ;;
  --live)
    [ "${3:-}" = "--yes" ] || { echo "This REPLACES the live database. Re-run with --yes to confirm." >&2; exit 1; }
    echo "stopping api and worker"; $DC stop api worker caddy
    psql_owner -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$POSTGRES_DB' AND pid<>pg_backend_pid()" >/dev/null
    psql_owner -d postgres -c "DROP DATABASE $POSTGRES_DB" -c "CREATE DATABASE $POSTGRES_DB"
    restore_into "$POSTGRES_DB"
    ./scripts/ensure-app-role.sh
    $DC up -d
    echo "restored from $DUMP"
    ;;
  *) sed -n 2,6p "$0"; exit 2;;
esac
