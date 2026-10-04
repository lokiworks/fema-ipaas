#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:?usage: restart-api.sh <slot 1-9>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_PORT=$((3100 + SLOT))
WEB_PORT=$((4200 + SLOT))
MOCK_PORT=$((18900 + SLOT))
STATE_DIR="${E2E_STATE_ROOT:-/tmp/fema-e2e}/slot-${SLOT}"
CONNECTORS="beisen,feishu,mysql,postgres,ai,connections,crypto,csv,data-mapper,data-summarizer,date-helper,file-helper,forms,http,manual-trigger,math-helper,mcp,schedule,store,subflows,tags,text-helper,webhook,xml"

pids="$(lsof -nP -tiTCP:"${API_PORT}" -sTCP:LISTEN || true)"
if [ -n "${pids}" ]; then
  kill ${pids}
  while lsof -nP -tiTCP:"${API_PORT}" -sTCP:LISTEN >/dev/null 2>&1; do sleep 1; done
fi

cd "${ROOT}"
export FEMA_PORT="${API_PORT}"
export FEMA_ENVIRONMENT=dev
export FEMA_DB_TYPE=PGLITE
export FEMA_REDIS_TYPE=MEMORY
export FEMA_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
export FEMA_JWT_SECRET="e2e-slot-${SLOT}-secret"
export FEMA_EXECUTION_MODE=UNSANDBOXED
export FEMA_FRONTEND_URL="http://localhost:${WEB_PORT}"
export FEMA_CONFIG_PATH="${STATE_DIR}/config"
export FEMA_DEV_CONNECTORS="${CONNECTORS}"
export FEMA_BEISEN_BASE_URL="http://127.0.0.1:${MOCK_PORT}/beisen"
export FEMA_FEISHU_BASE_URL="http://127.0.0.1:${MOCK_PORT}/feishu"
export FEMA_SANDBOX_PROPAGATED_ENV_VARS="FEMA_BEISEN_BASE_URL,FEMA_FEISHU_BASE_URL"
export FEMA_SSRF_ALLOW_LIST="${FEMA_SSRF_ALLOW_LIST:-127.0.0.1}"
export FEMA_DEV_API_PORT="${API_PORT}"
export FEMA_DEV_WEB_PORT="${WEB_PORT}"
for extra in "${@:2}"; do
  export "${extra?}"
done

nohup npx tsx --tsconfig packages/server/api/tsconfig.app.json packages/server/api/src/bootstrap.ts >"${STATE_DIR}/api.log" 2>&1 &
echo $! >"${STATE_DIR}/api.pid"
until curl -sf "http://localhost:${API_PORT}/api/v1/flags" >/dev/null 2>&1; do sleep 2; done
echo "api ready on ${API_PORT}"
