#!/usr/bin/env bash
# Polnaya podgotovka VPS: Node + zavisimosti bota + .env
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

bash deploy/vps/install-node.sh
bash deploy/vps/install.sh

echo ""
echo "=== Server ready for catalog + bot ==="
echo "  nano .env"
echo "  npm run reload-catalog"
echo "  ./deploy/vps/start.sh"
