#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:?usage: start-stack.sh <slot 1-9>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_PORT=$((3100 + SLOT))
WEB_PORT=$((4200 + SLOT))
MOCK_PORT=$((18900 + SLOT))
STATE_DIR="${E2E_STATE_ROOT:-/tmp/fema-e2e}/slot-${SLOT}"
CONNECTORS="beisen,feishu,mysql,postgres,ai,connections,crypto,csv,data-mapper,data-summarizer,date-helper,file-helper,forms,http,manual-trigger,math-helper,mcp,schedule,store,subflows,tags,text-helper,webhook,xml"

mkdir -p "${STATE_DIR}/config"
cd "${ROOT}"

MOCK_PORT="${MOCK_PORT}" nohup node tools/e2e/main-line/mock-server.mjs >"${STATE_DIR}/mock.log" 2>&1 &
echo $! >"${STATE_DIR}/mock.pid"

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
export FEMA_TRIGGER_DEFAULT_POLL_INTERVAL="${FEMA_TRIGGER_DEFAULT_POLL_INTERVAL:-1}"
export FEMA_DEV_API_PORT="${API_PORT}"
export FEMA_DEV_WEB_PORT="${WEB_PORT}"

nohup npx tsx --tsconfig packages/server/api/tsconfig.app.json packages/server/api/src/bootstrap.ts >"${STATE_DIR}/api.log" 2>&1 &
echo $! >"${STATE_DIR}/api.pid"
nohup npm --prefix packages/web run serve >"${STATE_DIR}/web.log" 2>&1 &
echo $! >"${STATE_DIR}/web.pid"

cat >"${STATE_DIR}/ports.env" <<EOF
API_URL=http://localhost:${API_PORT}
WEB_URL=http://localhost:${WEB_PORT}
MOCK_URL=http://127.0.0.1:${MOCK_PORT}
STATE_DIR=${STATE_DIR}
EOF
cat "${STATE_DIR}/ports.env"
