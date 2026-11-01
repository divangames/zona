#!/usr/bin/env bash
# Node.js 20 LTS для Ubuntu 22.04 (VPS), обход битого PPA certbot
set -euo pipefail

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Zapustite ot root: sudo $0"
  exit 1
fi

echo "=== ZonaDeck: Node.js 20 ==="

export DEBIAN_FRONTEND=noninteractive

echo "[1] Udalenie bitogo PPA certbot (esli est)..."
add-apt-repository -y -r ppa:certbot/certbot 2>/dev/null || true
rm -f /etc/apt/sources.list.d/certbot-ubuntu-certbot-*.list 2>/dev/null || true

echo "[2] Udalenie starogo nodejs iz Ubuntu (chasto v12)..."
apt-get remove -y nodejs npm 2>/dev/null || true
apt-get autoremove -y 2>/dev/null || true

echo "[3] apt update..."
apt-get update -qq

echo "[4] NodeSource 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs

NODE_V="$(node -v)"
NPM_V="$(npm -v)"
echo ""
echo "Node: $NODE_V"
echo "npm:  $NPM_V"

NODE_MAJOR="$(echo "$NODE_V" | sed 's/v//' | cut -d. -f1)"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo ""
  echo "OSHIBKA: Node < 18. Probуйte NVM:"
  echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo "  source ~/.bashrc && nvm install 20"
  exit 1
fi

echo "Gotovo."
