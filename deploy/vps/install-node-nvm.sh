#!/usr/bin/env bash
# Zapasnoj variant: Node 20 cherez NVM (ne zavisit ot apt PPA)
set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "Ustanovka NVM..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi

# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"

nvm install 20
nvm alias default 20

echo "Node: $(node -v)"
echo "npm:  $(npm -v)"
echo ""
echo "Dobavte v ~/.bashrc (esli net):"
echo '  export NVM_DIR="$HOME/.nvm"'
echo '  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'
