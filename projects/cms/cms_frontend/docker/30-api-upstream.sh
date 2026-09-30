#!/bin/sh
# Runs before nginx starts (nginx image entrypoint executes /docker-entrypoint.d/*.sh).
# Writes the /api proxy target and a DNS resolver into /tmp, which is the only writable path when
# the container runs with a read-only root filesystem.
#   API_UPSTREAM  where /api/* is forwarded (default http://api:4400, the compose/k8s service)
# The resolver is taken from the container's own resolv.conf, so it is right in Docker (127.0.0.11)
# and in Kubernetes (the cluster DNS) without configuration.
set -eu
upstream="${API_UPSTREAM:-http://api:4400}"
case "$upstream" in
  http://*|https://*) ;;
  *) echo "API_UPSTREAM must start with http:// or https://" >&2; exit 1 ;;
esac
# Reject anything that could inject nginx config through the environment variable.
case "$upstream" in
  *[!A-Za-z0-9:/._-]*) echo "API_UPSTREAM contains characters that are not allowed" >&2; exit 1 ;;
esac
ns="$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf)"
printf 'resolver %s valid=10s ipv6=off;\n' "${ns:-127.0.0.11}" > /tmp/api-resolver.conf
printf 'set $api_upstream "%s";\n' "$upstream" > /tmp/api-upstream.conf
