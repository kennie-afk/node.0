#!/usr/bin/env bash
# Creates a church and its first administrator on THIS install (there is no sign-up screen: the console is
# for existing churches). The password is typed without echo and sent over stdin, never on a command line.
#   ./scripts/create-church.sh "Grace Chapel Nairobi" grace-nairobi admin@gracechapel.example
# The church "slug" is a short lowercase identifier (letters, digits, dashes) that names it in the system.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
NAME="${1:?usage: create-church.sh \"Church name\" slug admin@email}"; SLUG="${2:?slug}"; EMAIL="${3:?admin email}"
read -r -s -p "Choose the administrator's password (12+ characters): " PW; echo
[ "${#PW}" -ge 12 ] || { echo "Too short: use at least 12 characters." >&2; exit 1; }
read -r -s -p "Type it again: " PW2; echo
[ "$PW" = "$PW2" ] || { echo "The two passwords differ." >&2; exit 1; }
case "$SITE_ADDRESS" in
  http://*) host="${SITE_ADDRESS#http://}"; host="${host%%:*}"; base="http://127.0.0.1:${HTTP_PORT:-80}"; hostflag="-H Host:${host:-localhost}";;
  *)        base="https://$SITE_ADDRESS:${HTTPS_PORT:-443}"; hostflag="--resolve $SITE_ADDRESS:${HTTPS_PORT:-443}:127.0.0.1";;
esac
prefix=""; [ "$CADDYFILE" = "Caddyfile" ] && prefix="/api"
export NAME SLUG EMAIL PW
body="$(python3 -c 'import json,os;print(json.dumps({"church":{"name":os.environ["NAME"],"slug":os.environ["SLUG"]},"owner":{"username":"admin","email":os.environ["EMAIL"],"password":os.environ["PW"]}}))')"
code="$(printf '%s' "$body" | curl -sS -m 30 $hostflag -o /tmp/create-church.out -w '%{http_code}' -H 'content-type: application/json' --data-binary @- "$base$prefix/churches")"
unset PW PW2 body
if [ "$code" = 201 ]; then echo "Created. Sign in at the site address with the email $EMAIL and the password you chose."; rm -f /tmp/create-church.out
else echo "Failed ($code): $(head -c 300 /tmp/create-church.out)"; rm -f /tmp/create-church.out; exit 1; fi
