#!/usr/bin/env bash
# Run ONCE on a fresh Ubuntu 22.04/24.04 VM (arm64 or amd64) as a user with sudo:
#   sudo ./scripts/first-run.sh [--fail2ban]
# Installs Docker, opens only ports 22, 80, 443 (tcp) and 443 (udp, HTTP/3), turns on automatic security
# updates, adds swap on small machines, and rotates container logs.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }
FAIL2BAN=0; [ "${1:-}" = "--fail2ban" ] && FAIL2BAN=1
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg rsync ufw unattended-upgrades iptables-persistent netfilter-persistent
[ "$FAIL2BAN" = 1 ] && apt-get install -y fail2ban

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "${SUDO_USER:-ubuntu}" || true
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'J'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" }, "live-restore": true }
J
systemctl enable --now docker && systemctl restart docker

# Firewall. Oracle Cloud's Ubuntu images ship iptables rules that reject everything but SSH, and ufw
# alone does not override them: insert accept rules ahead of the REJECT, and persist them.
if [ -f /etc/iptables/rules.v4 ] && grep -q REJECT /etc/iptables/rules.v4; then
  for r in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443"; do
    iptables -C INPUT $r -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -m state --state NEW $r -j ACCEPT
  done
  netfilter-persistent save
fi
ufw --force reset >/dev/null
ufw default deny incoming; ufw default allow outgoing
ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp
ufw --force enable

# Automatic security updates.
dpkg-reconfigure -f noninteractive unattended-upgrades

# Swap on small machines (Postgres and a Node build both like headroom).
RAM_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
if [ "$RAM_MB" -lt 4096 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
cat > /etc/sysctl.d/99-cms.conf <<'S'
vm.swappiness = 10
vm.overcommit_memory = 1
net.core.somaxconn = 4096
net.ipv4.tcp_fastopen = 3
net.core.rmem_max = 7500000
net.core.wmem_max = 7500000
S
sysctl --system >/dev/null
echo "Done. Log out and back in so the docker group applies, then see the README for the next step."
echo "REMINDER: also open ports 80, 443 (tcp) and 443 (udp) in your cloud provider's network rules (Oracle: the VCN security list)."
