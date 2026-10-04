#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:?usage: start-worker.sh <slot 1-9>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_PORT=$((3100 + SLOT))
WEB_PORT=$((4200 + SLOT))
MOCK_PORT=$((18900 + SLOT))
STATE_DIR="${E2E_STATE_ROOT:-/tmp/fema-e2e}/slot-${SLOT}"
CONNECTORS="beisen,feishu,mysql,postgres,ai,connections,crypto,csv,data-mapper,data-summarizer,date-helper,file-helper,forms,http,manual-trigger,math-helper,mcp,schedule,store,subflows,tags,text-helper,webhook,xml"
JWT_SECRET="e2e-slot-${SLOT}-secret"

cd "${ROOT}"
mkdir -p "${STATE_DIR}/worker-cache"

WORKER_TOKEN="$(JWT_SECRET="${JWT_SECRET}" node -e '
const jwt = require("jsonwebtoken");
process.stdout.write(jwt.sign({ id: "e2e-worker", type: "WORKER" }, process.env.JWT_SECRET, { algorithm: "HS256", issuer: "fema", expiresIn: "30d", keyid: "1" }));
')"

export FEMA_PORT="${API_PORT}"
export FEMA_ENVIRONMENT=dev
export FEMA_EXECUTION_MODE=UNSANDBOXED
export FEMA_FRONTEND_URL="http://localhost:${WEB_PORT}"
export FEMA_WORKER_TOKEN="${WORKER_TOKEN}"
export FEMA_CACHE_BASE_PATH="${STATE_DIR}/worker-cache"
export FEMA_DEV_CONNECTORS="${CONNECTORS}"
export FEMA_BEISEN_BASE_URL="http://127.0.0.1:${MOCK_PORT}/beisen"
export FEMA_FEISHU_BASE_URL="http://127.0.0.1:${MOCK_PORT}/feishu"
export FEMA_SANDBOX_PROPAGATED_ENV_VARS="FEMA_BEISEN_BASE_URL,FEMA_FEISHU_BASE_URL"
export FEMA_SSRF_ALLOW_LIST="${FEMA_SSRF_ALLOW_LIST:-127.0.0.1}"

nohup npx tsx --tsconfig packages/server/worker/tsconfig.lib.json packages/server/worker/src/bootstrap.ts >"${STATE_DIR}/worker.log" 2>&1 &
echo $! >"${STATE_DIR}/worker.pid"
echo "worker pid $(cat "${STATE_DIR}/worker.pid") log ${STATE_DIR}/worker.log"
