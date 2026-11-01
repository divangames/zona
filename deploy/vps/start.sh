#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — run ./deploy/vps/install.sh"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Missing node_modules — run ./deploy/vps/install.sh"
  exit 1
fi

if command -v pm2 >/dev/null 2>&1; then
  echo "Starting with PM2..."
  pm2 delete zona-bot 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 status
  echo "Logs: pm2 logs zona-bot"
else
  echo "PM2 not found. Install: npm install -g pm2"
  echo "Or run: node bot/index.js"
  exec node bot/index.js
fi
