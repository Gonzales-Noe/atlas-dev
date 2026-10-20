#!/usr/bin/env bash
# Run as root on the Hostinger VPS after first login.
# Usage: bash bootstrap.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Gonzales-Noe/atlas-dev.git}"
BRANCH="${BRANCH:-atlas-vps-production}"
APP_DIR="${APP_DIR:-/opt/atlas}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates ufw

# Firewall: SSH + web only (do not open Ollama 11434)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable || true

# Docker if missing
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

mkdir -p "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  cd "$APP_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi

cd "$APP_DIR"
chmod +x deploy/vps/*.sh || true

echo
echo "==> Repo ready at $APP_DIR"
echo "Next:"
echo "  1) Copy secrets:  cp backend/.env.example backend/.env && nano backend/.env"
echo "  2) Set VITE_API_URL=http://YOUR_IP/api  (or https://your.domain/api) in a .env next to compose"
echo "  3) Build/start:   docker compose -f docker-compose.vps.yml up -d --build"
echo "  4) Pull model:    docker exec -it atlas_ollama ollama pull llama3.2:3b"
echo "  5) Migrate:       docker exec -it atlas_backend python manage.py migrate"
