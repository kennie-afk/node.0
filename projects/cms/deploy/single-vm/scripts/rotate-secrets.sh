#!/usr/bin/env bash
# Rotate a secret.
#   ./rotate-secrets.sh jwt     new token-signing key. Everyone is signed out (their tokens stop verifying).
#   ./rotate-secrets.sh appdb   new password for the application database role (zero data impact).
# Rotating the OWNER password (POSTGRES_PASSWORD) is done by hand: see the README.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
DC="docker compose -p "${COMPOSE_PROJECT:-cms}" -f docker-compose.prod.yml --env-file .env"
secret() { local s; s="$(openssl rand -base64 192 | tr -dc 'A-Za-z0-9')"; printf '%s' "${s:0:${1:-40}}"; }
setenv() { local k="$1" v="$2"; umask 077; tmp="$(mktemp .env.XXXXXX)"; grep -v "^$k=" .env > "$tmp"; echo "$k=$v" >> "$tmp"; mv "$tmp" .env; chmod 600 .env; }
case "${1:-}" in
  jwt)
    cp .env ".env.bak.$(date +%s)"; chmod 600 .env.bak.*
    setenv JWT_SECRET "$(secret 64)"
    $DC up -d --force-recreate api worker
    echo "JWT secret rotated; every user must sign in again. Delete the .env.bak.* file once you are sure."
    ;;
  appdb)
    cp .env ".env.bak.$(date +%s)"; chmod 600 .env.bak.*
    new="$(secret 32)"
    $DC exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -qc "ALTER ROLE ${APP_DB_USER:-cms_app} PASSWORD '$new'"
    setenv APP_DB_PASSWORD "$new"
    $DC up -d --force-recreate pgbouncer api worker
    echo "application database password rotated. Delete the .env.bak.* file once you are sure."
    ;;
  *) sed -n 2,6p "$0"; exit 2;;
esac
