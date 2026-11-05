#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:-${E2E_SLOT:-3}}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
STATE_ROOT="${E2E_STATE_ROOT:-/tmp/fema-e2e}"
STATE_DIR="${STATE_ROOT}/slot-${SLOT}"
IAM_PORT="${FEMA_IAM_PORT:-$((19300 + SLOT))}"
WEB_PORT=$((4200 + SLOT))
BROWSER="${SAAS_BROWSER:-container}"
PW_IMAGE="${SAAS_PW_IMAGE:-mcr.microsoft.com/playwright:v1.54.1-noble}"
export E2E_SLOT="${SLOT}" E2E_STATE_ROOT="${STATE_ROOT}" FEMA_IAM_PORT="${IAM_PORT}"

mkdir -p "${STATE_DIR}/shots/saas"
cd "${ROOT}"

stop_port() {
  local pids
  pids="$(lsof -nP -tiTCP:"$1" -sTCP:LISTEN || true)"
  if [ -n "${pids}" ]; then
    kill ${pids}
  fi
}

if [ "${SAAS_SKIP_BUILD:-0}" != "1" ]; then
  npx turbo run build --filter=@fema-ipaas/connector-fema --filter=@fema-ipaas/shared --filter=@fema-ipaas/core-utils --filter=@fema-ipaas/engine
fi

if ! curl -s --noproxy '*' -o /dev/null "http://localhost:${WEB_PORT}/"; then
  echo "web on ${WEB_PORT} is not up; start the stack first: bash tools/e2e/stack/start-stack.sh ${SLOT}" >&2
  exit 2
fi

stop_port "${IAM_PORT}"
sleep 1
E2E_SLOT="${SLOT}" FEMA_IAM_PORT="${IAM_PORT}" nohup node tools/e2e/mocks/fema-iam.mjs >"${STATE_DIR}/fema-iam.log" 2>&1 &
for _ in $(seq 1 30); do
  if curl -s --noproxy '*' -o /dev/null "http://127.0.0.1:${IAM_PORT}/"; then break; fi
  sleep 0.5
done

if [ "${SAAS_SKIP_FRESH:-0}" != "1" ]; then
  stop_port $((3100 + SLOT))
  while lsof -nP -tiTCP:$((3100 + SLOT)) -sTCP:LISTEN >/dev/null 2>&1; do sleep 1; done
  rm -rf "${STATE_DIR}/config/pglite"
  bash tools/e2e/stack/restart-api.sh "${SLOT}" ${SAAS_API_ENV:-}
fi

started_worker=0
if [ "${SAAS_START_WORKER:-1}" = "1" ]; then
  if [ ! -f "${STATE_DIR}/worker.pid" ] || ! kill -0 "$(cat "${STATE_DIR}/worker.pid")" 2>/dev/null; then
    bash tools/e2e/stack/start-worker.sh "${SLOT}"
    started_worker=1
  fi
fi
export SAAS_WITH_WORKER="${SAAS_WITH_WORKER:-1}"

run_browser() {
  local phase="$1"
  case "${BROWSER}" in
    off) return 0 ;;
    local) SAAS_BROWSER_PHASE="${phase}" node tools/e2e/scenarios/saas/saas-browser.mjs ;;
    container)
      docker run --rm --network host --ipc=host \
        -v "${ROOT}:${ROOT}" -v "${STATE_ROOT}:${STATE_ROOT}" -w "${ROOT}" \
        -e E2E_SLOT="${SLOT}" -e E2E_STATE_ROOT="${STATE_ROOT}" -e FEMA_IAM_PORT="${IAM_PORT}" -e SAAS_BROWSER_PHASE="${phase}" \
        "${PW_IMAGE}" node tools/e2e/scenarios/saas/saas-browser.mjs ;;
  esac
}

status=0
run_browser zero || status=1
node tools/e2e/scenarios/saas/saas-federation.mjs || status=1
run_browser federation || status=1

if [ "${started_worker}" = "1" ] && [ "${SAAS_KEEP_WORKER:-0}" != "1" ]; then
  bash tools/e2e/stack/stop-worker.sh "${SLOT}"
fi
stop_port "${IAM_PORT}"

echo "logs: ${STATE_DIR}/api.log ${STATE_DIR}/fema-iam.log; shots: ${STATE_DIR}/shots/saas"
exit "${status}"
