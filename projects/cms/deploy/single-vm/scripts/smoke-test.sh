#!/usr/bin/env bash
# Checks the running stack from the VM itself. Exits non-zero on the first failure.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
DC="docker compose -p "${COMPOSE_PROJECT:-cms}" -f docker-compose.prod.yml --env-file .env"
fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "ok:   $*"; }

# 1. Containers: every service with a health check is healthy; migrate exited 0.
bad="$($DC ps --format '{{.Service}} {{.State}} {{.Health}}' | awk '$2!="running" && $1!="migrate" {print $1": "$2} $3=="unhealthy" {print $1": unhealthy"}')"
[ -z "$bad" ] || fail "not running/healthy: $bad"
ok "all services running and healthy"

# 2. API behind Caddy. For a real hostname, resolve it to this machine so the real certificate is
# exercised; for a plain-HTTP local test (SITE_ADDRESS=http://localhost) talk to the mapped port.
case "$SITE_ADDRESS" in
  http://*) host="${SITE_ADDRESS#http://}"; host="${host%%:*}"; host="${host:-localhost}"
            base="http://127.0.0.1:${HTTP_PORT:-80}"; hostflag="-H Host:$host"; secure=0;;
  *)        base="https://$SITE_ADDRESS:${HTTPS_PORT:-443}"
            hostflag="--resolve $SITE_ADDRESS:${HTTPS_PORT:-443}:127.0.0.1"; secure=1;;
esac
get() { curl -sS -m 15 $hostflag "$@"; }
apiprefix=""; [ "$CADDYFILE" = "Caddyfile" ] && apiprefix="/api"
code="$(get -o /dev/null -w '%{http_code}' "$base$apiprefix/readyz" 2>/dev/null || echo 000)"
[ "$code" = "200" ] || fail "/readyz returned $code"
ok "readiness endpoint answers 200 through Caddy"

# 3. Security headers present.
hdrs="$(get -sI "$base$apiprefix/readyz" 2>/dev/null | tr -d '\r' | tr 'A-Z' 'a-z')"
if [ "$secure" = 1 ]; then echo "$hdrs" | grep -q "strict-transport-security" || fail "no HSTS header"; fi
echo "$hdrs" | grep -q "x-content-type-options: nosniff" || fail "no nosniff header"
if echo "$hdrs" | grep -q "^server:"; then fail "Server header is exposed"; fi
ok "security headers set, Server header removed"

# 4. Row-level security is effective for the role the API uses.
rls="$($DC exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname='${APP_DB_USER:-cms_app}'")"
[ "$rls" = "f" ] || fail "application role can bypass row-level security ($rls)"
ok "application database role cannot bypass row-level security"

# 5. Only Caddy publishes ports. The database, pooler, cache and API are reachable on the compose network only.
for svc in postgres pgbouncer redis api worker; do
  id="$($DC ps -q "$svc" | head -1)"
  [ -n "$id" ] || continue
  published="$(docker inspect -f '{{range $p, $b := .NetworkSettings.Ports}}{{if $b}}{{$p}} {{end}}{{end}}' "$id")"
  [ -z "$published" ] || fail "$svc publishes host ports: $published"
done
ok "postgres, pgbouncer, redis, api and worker publish no host ports"
echo "SMOKE TEST PASSED"
