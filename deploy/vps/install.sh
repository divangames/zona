#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "=== ZonaDeck install ==="
echo "Path: $ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js ne ustanovlen."
  echo "Ot root vypolnite:"
  echo "  cd $ROOT"
  echo "  chmod +x deploy/vps/install-node.sh"
  echo "  ./deploy/vps/install-node.sh"
  exit 1
fi

NODE_MAJOR="$(node -v | sed 's/v//' | cut -d. -f1)"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "Nuzhen Node 18+, seychas: $(node -v)"
  echo "Zapustite: ./deploy/vps/install-node.sh"
  exit 1
fi

echo "Node: $(node -v)"

if [[ ! -f package-lock.json ]]; then
  echo "package-lock.json missing"
  exit 1
fi

echo "npm ci --omit=dev..."
npm ci --omit=dev

mkdir -p data

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env — edit TELEGRAM_BOT_TOKEN and OLLAMA_*"
else
  echo ".env exists"
fi

chmod +x deploy/vps/*.sh 2>/dev/null || true

echo ""
echo "Done. Next:"
echo "  nano .env"
echo "  npm run reload-catalog   # if no data/catalog-cache.json"
echo "  ./deploy/vps/start.sh"
