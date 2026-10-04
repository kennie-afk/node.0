#!/usr/bin/env bash
# Installs a systemd timer that runs backup.sh every night at 02:30 UTC (and catches up after downtime).
#   sudo ./scripts/install-backup-timer.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }
DIR="$(cd "$(dirname "$0")/.." && pwd)"; RUN_USER="${SUDO_USER:-ubuntu}"
cat > /etc/systemd/system/cms-backup.service <<U
[Unit]
Description=Church CMS database backup
After=docker.service
[Service]
Type=oneshot
User=$RUN_USER
WorkingDirectory=$DIR
ExecStart=$DIR/scripts/backup.sh
U
cat > /etc/systemd/system/cms-backup.timer <<U
[Unit]
Description=Nightly Church CMS backup
[Timer]
OnCalendar=*-*-* 02:30:00 UTC
Persistent=true
RandomizedDelaySec=300
[Install]
WantedBy=timers.target
U
systemctl daemon-reload && systemctl enable --now cms-backup.timer
systemctl list-timers cms-backup.timer --no-pager
