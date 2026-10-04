#!/usr/bin/env bash
# Run on YOUR computer. Copies the source to the VM and runs up.sh there.
#   ./deploy.sh ubuntu@203.0.113.10 [--key ~/.ssh/id_ed25519] [--copy-only]
#   --copy-only   just copy the files (the very first time: the VM has nothing to run yet)
# First time only, on the VM:  ./scripts/generate-env.sh --site <hostname> ...   (see README)
set -euo pipefail
TARGET="${1:?usage: deploy.sh user@host [--key path]}"; shift || true
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
COPY_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --key) SSH_OPTS+=(-i "$2"); shift 2;;
    --copy-only) COPY_ONLY=1; shift;;
    *) echo "unknown option: $1" >&2; exit 2;;
  esac
done
HERE="$(cd "$(dirname "$0")/../../.." && pwd)"     # projects/cms
echo "== copying $HERE to $TARGET:~/cms"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules --exclude dist --exclude .git --exclude test-results --exclude '.env' \
  --exclude 'deploy/single-vm/.env' --exclude 'deploy/single-vm/backups' --exclude 'deploy/single-vm/postgres/tuned.conf' \
  --exclude screenshots --exclude '*.log' "$HERE/" "$TARGET:cms/"
[ "$COPY_ONLY" = 1 ] && { echo "== copied. Next, on the VM: see README step 4."; exit 0; }
echo "== building and starting on the VM"
ssh "${SSH_OPTS[@]}" "$TARGET" "cd ~/cms/deploy/single-vm && chmod +x scripts/*.sh && ./scripts/up.sh"
