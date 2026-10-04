#!/usr/bin/env bash
# Build and start (or update) the stack on THIS machine, wait until it is healthy, and smoke-test it.
# Safe to run again: migrations take an advisory lock and are idempotent, containers are replaced one
# service at a time. Run from anywhere:  ./scripts/up.sh   [--no-build]
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "No .env here. Run: ./scripts/generate-env.sh --site <hostname>" >&2; exit 1; }
set -a; . ./.env; set +a
DC="docker compose -p "${COMPOSE_PROJECT:-cms}" -f docker-compose.prod.yml --env-file .env"
[ -f postgres/tuned.conf ] || { echo "postgres/tuned.conf missing: run generate-env.sh" >&2; exit 1; }

if [ "${1:-}" != "--no-build" ]; then
  echo "== building images (first build takes a few minutes)"
  $DC build
fi
echo "== starting the database and making sure the application role exists"
$DC up -d postgres
for i in $(seq 1 60); do
  [ "$($DC ps --format '{{.Health}}' postgres 2>/dev/null)" = "healthy" ] && break
  [ "$i" = 60 ] && { echo "Postgres did not become healthy" >&2; $DC logs --tail 40 postgres >&2; exit 1; }
  sleep 1
done
./scripts/ensure-app-role.sh
echo "== starting everything"
$DC up -d --remove-orphans

echo "== waiting for the API to be healthy"
for i in $(seq 1 90); do
  state="$($DC ps --format '{{.Service}} {{.Health}}' api 2>/dev/null | awk '{print $2}')"
  [ "$state" = "healthy" ] && break
  [ "$i" = 90 ] && { echo "API did not become healthy in 3 minutes. Logs:" >&2; $DC logs --tail 60 api migrate >&2; exit 1; }
  sleep 2
done

echo "== enabling pg_stat_statements (idempotent)"
$DC exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -qc "CREATE EXTENSION IF NOT EXISTS pg_stat_statements" >/dev/null

echo "== smoke test"
HTTP_PORT="${HTTP_PORT:-80}" HTTPS_PORT="${HTTPS_PORT:-443}" ./scripts/smoke-test.sh
docker image prune -f >/dev/null 2>&1 || true
case "$SITE_ADDRESS" in http://*) echo "== done. $SITE_ADDRESS";; *) echo "== done. https://$SITE_ADDRESS";; esac
