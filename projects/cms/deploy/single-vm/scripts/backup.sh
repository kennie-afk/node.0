#!/usr/bin/env bash
# Nightly logical backup (pg_dump custom format, compressed). Keeps 7 daily and 4 weekly dumps on this
# machine. If RCLONE_REMOTE is set (e.g. "r2:cms-backups" for a Cloudflare R2 or Backblaze B2 bucket you
# configured with `rclone config`), the new dump is also copied there. Run by the systemd timer that
# install-backup-timer.sh sets up; safe to run by hand.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
DC="docker compose -p "${COMPOSE_PROJECT:-cms}" -f docker-compose.prod.yml --env-file .env"
DIR="${BACKUP_DIR:-./backups}"; mkdir -p "$DIR/daily" "$DIR/weekly"; chmod 700 "$DIR"
stamp="$(date -u +%Y%m%d-%H%M%S)"
tmp="$DIR/daily/.cms-$stamp.partial"; out="$DIR/daily/cms-$stamp.dump"

# -Fc is already compressed; -Z 6 balances CPU and size. The dump is taken as the OWNER (reads every
# tenant's rows, which row-level security would hide from the application role).
$DC exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6 --no-owner > "$tmp"
# A dump that cannot be listed is not a backup.
$DC exec -T postgres pg_restore --list < "$tmp" >/dev/null || { rm -f "$tmp"; echo "backup failed verification" >&2; exit 1; }
mv "$tmp" "$out"; chmod 600 "$out"
[ "$(date -u +%u)" = 7 ] && cp "$out" "$DIR/weekly/cms-$stamp.dump"

# Retention: newest 7 daily, newest 4 weekly.
ls -1t "$DIR"/daily/cms-*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f
ls -1t "$DIR"/weekly/cms-*.dump 2>/dev/null | tail -n +5 | xargs -r rm -f

if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copyto "$out" "$RCLONE_REMOTE/daily/$(basename "$out")" --s3-no-check-bucket 2>/dev/null \
    || rclone copyto "$out" "$RCLONE_REMOTE/daily/$(basename "$out")"
  echo "copied to $RCLONE_REMOTE"
fi
echo "backup ok: $out ($(du -h "$out" | cut -f1))"
