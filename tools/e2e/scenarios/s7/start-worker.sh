#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:?usage: start-worker.sh <slot 1-9>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
API_PORT=$((3100 + SLOT))
WEB_PORT=$((4200 + SLOT))
MOCK_PORT=$((18900 + SLOT))
STATE_DIR="${E2E_STATE_ROOT:-/tmp/fema-e2e}/slot-${SLOT}"
CONNECTORS="beisen,feishu,mysql,postgres,ai,connections,crypto,csv,data-mapper,data-summarizer,date-helper,file-helper,forms,http,manual-trigger,math-helper,mcp,schedule,store,subflows,tags,text-helper,webhook,xml"
JWT_SECRET="e2e-slot-${SLOT}-secret"

cd "${ROOT}"
WORKER_TOKEN="$(node -e "
const jwt = require('${ROOT}/packages/server/api/node_modules/jsonwebtoken');
process.stdout.write(jwt.sign({ id: 'e2e-worker-${SLOT}', type: 'WORKER' }, '${JWT_SECRET}', { algorithm: 'HS256', keyid: '1', issuer: 'fema', expiresIn: 86400 }));
")"

export FEMA_PORT="${API_PORT}"
export FEMA_ENVIRONMENT=dev
export FEMA_DB_TYPE=PGLITE
export FEMA_REDIS_TYPE=MEMORY
export FEMA_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
export FEMA_JWT_SECRET="${JWT_SECRET}"
export FEMA_EXECUTION_MODE=UNSANDBOXED
export FEMA_FRONTEND_URL="http://localhost:${WEB_PORT}"
export FEMA_CONFIG_PATH="${STATE_DIR}/config"
export FEMA_DEV_CONNECTORS="${CONNECTORS}"
export FEMA_BEISEN_BASE_URL="http://127.0.0.1:${MOCK_PORT}/beisen"
export FEMA_FEISHU_BASE_URL="http://127.0.0.1:${MOCK_PORT}/feishu"
export FEMA_SANDBOX_PROPAGATED_ENV_VARS="FEMA_BEISEN_BASE_URL,FEMA_FEISHU_BASE_URL"
export FEMA_WORKER_TOKEN="${WORKER_TOKEN}"
export FEMA_CONTAINER_TYPE=WORKER_AND_APP

nohup npx tsx --tsconfig packages/server/worker/tsconfig.lib.json packages/server/worker/src/bootstrap.ts >"${STATE_DIR}/worker.log" 2>&1 &
echo $! >"${STATE_DIR}/worker.pid"
echo "worker pid $(cat "${STATE_DIR}/worker.pid")"
