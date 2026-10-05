#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:-3}"
DIR="${E2E_STATE_ROOT:-/tmp/fema-e2e}/slot-${SLOT}/idp"
mkdir -p "${DIR}"
cd "${DIR}"
[ -f package.json ] || npm init -y >/dev/null
[ -d node_modules/oidc-provider ] || npm install oidc-provider
echo "${DIR}"
