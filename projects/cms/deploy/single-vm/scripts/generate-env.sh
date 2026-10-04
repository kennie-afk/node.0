#!/usr/bin/env bash
# Writes ../.env (mode 600) with strong random secrets, and ../postgres/tuned.conf sized to THIS machine's RAM.
# Secrets are generated and written to the file only; they are never printed.
#
#   ./generate-env.sh --site cms.example.com [--cors https://cms.example.com] [--email you@example.com]
#                     [--cloudflare] [--api-only --console-origin https://church-cms-seven.vercel.app] [--force]
#
#   --site      the hostname Caddy serves (and gets a certificate for): your domain, or <ip>.sslip.io
#   --cors      exact origin(s) allowed to call the API, comma separated (default: https://<site>)
#   --cloudflare  the site is proxied by Cloudflare: trust its address ranges to learn the real client IP
#   --api-only  the console is hosted elsewhere (Vercel): use Caddyfile.api-only and require --console-origin
set -euo pipefail
cd "$(dirname "$0")/.."

SITE="" CORS="" EMAIL="" CLOUDFLARE=0 API_ONLY=0 CONSOLE_ORIGIN="" FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --site) SITE="$2"; shift 2;;
    --cors) CORS="$2"; shift 2;;
    --email) EMAIL="$2"; shift 2;;
    --cloudflare) CLOUDFLARE=1; shift;;
    --api-only) API_ONLY=1; shift;;
    --console-origin) CONSOLE_ORIGIN="$2"; shift 2;;
    --force) FORCE=1; shift;;
    -h|--help) sed -n 2,14p "$0"; exit 0;;
    *) echo "unknown option: $1" >&2; exit 2;;
  esac
done
[ -n "$SITE" ] || { echo "--site <hostname> is required (see --help)" >&2; exit 2; }
case "$SITE" in http://*) ;; *) [ -n "$EMAIL" ] || { echo "--email you@example.com is required for a real hostname (Let's Encrypt sends certificate-expiry notices there)" >&2; exit 2; };; esac
if [ -e .env ] && [ "$FORCE" != 1 ]; then
  echo ".env already exists. Re-running would replace every secret and lock you out of the existing database." >&2
  echo "Use --force only on a brand-new install." >&2; exit 1
fi
if [ "$API_ONLY" = 1 ]; then
  [ -n "$CONSOLE_ORIGIN" ] || { echo "--api-only needs --console-origin https://where-the-console-is-hosted" >&2; exit 2; }
  CORS="${CORS:-$CONSOLE_ORIGIN}"; CADDYFILE="Caddyfile.api-only"
else
  CORS="${CORS:-https://$SITE}"; CADDYFILE="Caddyfile"
fi

# 40-character URL-safe secrets (no characters that need escaping in a connection URL).
secret() { local s; s="$(openssl rand -base64 192 | tr -dc 'A-Za-z0-9')"; printf '%s' "${s:0:${1:-40}}"; }
JWT="$(secret 64)"; PGPASS="$(secret 32)"; APPPASS="$(secret 32)"

if [ "$CLOUDFLARE" = 1 ]; then
  # Cloudflare's published ranges (https://www.cloudflare.com/ips-v4 and /ips-v6). They change rarely;
  # re-check them when you set this up and every few months.
  TRUSTED="173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22 2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32"
else
  TRUSTED="127.0.0.1/32"
fi

# Size everything from the machine's RAM (MB). Leave room for the OS, Caddy, Redis and the API.
RAM_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 2048)
pg_mb=$(( RAM_MB * 30 / 100 ));  [ $pg_mb -gt 8192 ] && pg_mb=8192;   [ $pg_mb -lt 384 ] && pg_mb=384
sb_mb=$(( pg_mb * 55 / 100 ));   [ $sb_mb -lt 128 ] && sb_mb=128
ec_mb=$(( RAM_MB * 55 / 100 ));  [ $ec_mb -lt 256 ] && ec_mb=256
wm_mb=$(( RAM_MB / 1024 * 2 + 4 )); [ $wm_mb -gt 32 ] && wm_mb=32;    [ $wm_mb -lt 4 ] && wm_mb=4
mm_mb=$(( RAM_MB / 16 ));         [ $mm_mb -gt 1024 ] && mm_mb=1024;   [ $mm_mb -lt 64 ] && mm_mb=64
wal_mb=$(( RAM_MB / 4 ));         [ $wal_mb -gt 4096 ] && wal_mb=4096; [ $wal_mb -lt 1024 ] && wal_mb=1024
api_mb=$(( RAM_MB * 10 / 100 ));  [ $api_mb -gt 2048 ] && api_mb=2048; [ $api_mb -lt 384 ] && api_mb=384
wk_mb=$(( api_mb / 2 ));          [ $wk_mb -lt 256 ] && wk_mb=256
# Memory limit for the Postgres container: shared buffers plus headroom for connections and maintenance.
pgc_mb=$(( sb_mb + mm_mb + 512 + 60 * wm_mb / 2 ))

umask 077
mkdir -p postgres backups
sed -e "s/@RAM_MB@/$RAM_MB/" -e "s/@SHARED_BUFFERS@/${sb_mb}MB/" -e "s/@EFFECTIVE_CACHE@/${ec_mb}MB/" \
    -e "s/@WORK_MEM@/${wm_mb}MB/" -e "s/@MAINT_MEM@/${mm_mb}MB/" -e "s/@MAX_WAL@/${wal_mb}MB/" \
    postgres/tuned.conf.template > postgres/tuned.conf

cat > .env <<ENV
# Generated $(date -u +%FT%TZ) by generate-env.sh. Mode 600. Back this file up somewhere safe and private:
# without it (especially the database passwords) a restored backup cannot be used by a fresh server.
SITE_ADDRESS=$SITE
ACME_EMAIL=$EMAIL
CADDYFILE=$CADDYFILE
CONSOLE_ORIGIN=$CONSOLE_ORIGIN
TRUSTED_PROXIES="$TRUSTED"
CORS_ORIGINS=$CORS

POSTGRES_USER=cms
POSTGRES_DB=cms
POSTGRES_PASSWORD=$PGPASS
APP_DB_USER=cms_app
APP_DB_PASSWORD=$APPPASS
JWT_SECRET=$JWT
JWT_TTL_MINUTES=60

# Sized for ${RAM_MB} MB of RAM. Edit if you move to a different machine.
PG_MEM=${pgc_mb}m
API_MEM=${api_mb}m
WORKER_MEM=${wk_mb}m
PGBOUNCER_POOL_SIZE=20
DB_POOL_MAX=12
RATE_LIMIT_MAX=600
LOGIN_RATE_LIMIT_MAX=5

# Real M-Pesa and SMS need Safaricom/provider credentials and a tested callback URL. Leave on mock until then.
MPESA_MODE=mock
SMS_MODE=mock
DEMO_LOGINS=false
BACKUP_DIR=./backups
ENV
chmod 600 .env
# tuned.conf holds no secrets and must be readable by the postgres user inside the container.
chmod 644 postgres/tuned.conf
echo "Wrote .env (secrets generated, not shown, mode 600) and postgres/tuned.conf for ${RAM_MB} MB RAM."
echo "Site: $SITE   Mode: $CADDYFILE   CORS: $CORS   Trusted proxies: $([ "$CLOUDFLARE" = 1 ] && echo Cloudflare || echo direct)"
