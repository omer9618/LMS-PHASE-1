#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 24.04 VPS for LMS environments. Run as root:
#
#   sudo bash bootstrap-vps.sh '<deploy public key>' [environment ...]
#   e.g. sudo bash bootstrap-vps.sh 'ssh-ed25519 AAAA... github-deploy' staging production
#
# Idempotent. It installs Docker Engine and the Compose plugin, creates the `deploy` user
# (key-only SSH, member of the docker group), opens only SSH/HTTP/HTTPS in the firewall,
# creates /opt/lms/{edge,<environment>...} and the shared `edge` Docker network, and enables
# unattended security upgrades. It does not write any secret: see docs/DEPLOYMENT.md.
set -euo pipefail

pubkey=${1:-}
shift || true
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
[[ $pubkey == ssh-* ]] || { echo "usage: bootstrap-vps.sh '<ssh public key>' [environment ...]" >&2; exit 1; }
environments=("$@")
[ "${#environments[@]}" -gt 0 ] || environments=(staging)
for env in "${environments[@]}"; do
  [[ $env =~ ^[a-z][a-z0-9-]{1,30}$ ]] || { echo "invalid environment name: $env" >&2; exit 1; }
done

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl ufw unattended-upgrades

# Docker Engine from Docker's own repository (Ubuntu's docker.io lags behind).
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  codename=$(. /etc/os-release && echo "$VERSION_CODENAME")
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

# Rotate container logs host-wide too (compose files also set limits per service).
if [ ! -f /etc/docker/daemon.json ]; then
  printf '%s\n' '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }' \
    >/etc/docker/daemon.json
  systemctl restart docker
fi

# Deploy user: GitHub Actions connects as this user. Docker group = root-equivalent, so the
# key is the only way in (no password).
if ! id deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash deploy
  passwd -l deploy >/dev/null
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
grep -qxF "$pubkey" /home/deploy/.ssh/authorized_keys || echo "$pubkey" >>/home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# SSH: keys only, no root login.
cat >/etc/ssh/sshd_config.d/90-lms.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
systemctl reload ssh || systemctl reload sshd || true

# Firewall: SSH, HTTP (ACME challenge + redirect), HTTPS (TCP and QUIC).
# Docker-published ports bypass ufw; only Caddy publishes any (80/443), Postgres publishes none.
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

# Directories and the shared proxy network.
install -d -m 750 -o deploy -g deploy /opt/lms /opt/lms/edge /opt/lms/edge/sites
for env in "${environments[@]}"; do
  install -d -m 750 -o deploy -g deploy "/opt/lms/$env" "/opt/lms/$env/scripts"
  install -d -m 700 -o deploy -g deploy "/var/backups/lms-$env"
done
docker network inspect edge >/dev/null 2>&1 || docker network create edge >/dev/null

dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null || true

echo "VPS ready for: ${environments[*]}. Next: docs/DEPLOYMENT.md, 'First deploy of an environment'."
