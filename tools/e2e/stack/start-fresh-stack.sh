#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:?usage: start-fresh-stack.sh <slot 1-9>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_PORT=$((3100 + SLOT))
WEB_PORT="${E2E_WEB_PORT:-$((4200 + SLOT))}"
STATE_DIR="${E2E_STATE_ROOT:-/tmp/fema-e2e}/slot-${SLOT}"

for port in "${API_PORT}" "${WEB_PORT}"; do
  pids="$(lsof -nP -tiTCP:"${port}" -sTCP:LISTEN || true)"
  if [ -n "${pids}" ]; then
    kill ${pids}
  fi
done
sleep 1

rm -rf "${STATE_DIR}/config"
mkdir -p "${STATE_DIR}/config" "${STATE_DIR}/shots"
cd "${ROOT}"

if [ "${E2E_KEEP_PROXY:-0}" != "1" ]; then
  unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
fi

export FEMA_PORT="${API_PORT}"
export FEMA_DB_TYPE=PGLITE
export FEMA_REDIS_TYPE=MEMORY
export FEMA_JWT_SECRET="e2e-slot-${SLOT}-secret"
export FEMA_CONFIG_PATH="${STATE_DIR}/config"
export FEMA_FRONTEND_URL="${FEMA_FRONTEND_URL:-http://localhost:${WEB_PORT}}"
export FEMA_DEV_API_PORT="${API_PORT}"
export FEMA_DEV_WEB_PORT="${WEB_PORT}"
if [ "${E2E_NO_KEY:-0}" != "1" ]; then
  export FEMA_ENCRYPTION_KEY="${FEMA_ENCRYPTION_KEY:-0123456789abcdef0123456789abcdef}"
fi
export NODE_OPTIONS="${NODE_OPTIONS:-} --require ${ROOT}/tools/e2e/stack/instance-preload.cjs"

nohup npx tsx --tsconfig packages/server/api/tsconfig.app.json packages/server/api/src/main.ts >"${STATE_DIR}/api.log" 2>&1 &
echo $! >"${STATE_DIR}/api.pid"
(cd packages/web && nohup npx vite --config "${ROOT}/tools/e2e/stack/vite.e2e.config.mts" --strictPort >"${STATE_DIR}/web.log" 2>&1 &)

for _ in $(seq 1 120); do
  if curl -s --noproxy '*' "http://localhost:${API_PORT}/api/v1/health/setup" | grep -q initialized; then
    break
  fi
  sleep 2
done
for _ in $(seq 1 60); do
  if curl -s --noproxy '*' -o /dev/null "http://localhost:${WEB_PORT}/"; then
    break
  fi
  sleep 1
done

cat >"${STATE_DIR}/ports.env" <<PORTS
API_URL=http://localhost:${API_PORT}
WEB_URL=http://localhost:${WEB_PORT}
STATE_DIR=${STATE_DIR}
PORTS
cat "${STATE_DIR}/ports.env"
