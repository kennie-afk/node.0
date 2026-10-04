#!/usr/bin/env bash
# Makes sure the restricted application database role exists, has the password in .env, and carries its safety
# limits. Idempotent; safe on every deploy and required around restores.
#
# Why it exists: the role is created by an early migration. A database RESTORED onto a new server already has
# that migration recorded as applied, so nothing would recreate the role (roles live in the cluster, not in the
# dump) and the API could not connect. The password is passed through the environment, never on a command line.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
DC="docker compose -p \"${COMPOSE_PROJECT:-cms}\" -f docker-compose.prod.yml --env-file .env"
eval "$DC" exec -T -e APP_ROLE="${APP_DB_USER:-cms_app}" -e APP_PW="$APP_DB_PASSWORD" postgres \
  psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
\set role `printenv APP_ROLE`
\set pw `printenv APP_PW`
SELECT format('CREATE ROLE %I NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN', :'role')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I NOSUPERUSER NOBYPASSRLS PASSWORD %L', :'role', :'pw') \gexec
-- PgBouncer in transaction mode does not forward startup parameters, so the limits live on the role.
SELECT format('ALTER ROLE %I SET statement_timeout = %L', :'role', '15s') \gexec
SELECT format('ALTER ROLE %I SET idle_in_transaction_session_timeout = %L', :'role', '30s') \gexec
SQL
