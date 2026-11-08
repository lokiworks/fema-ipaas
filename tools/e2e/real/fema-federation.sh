#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:-8}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FIXTURES="${E2E_FEMA_REAL_FIXTURES:-/srv/dev/tmp/loki/fema-real/fixtures.json}"
PUBLIC_URL="${E2E_PUBLIC_URL:-https://localhost:24443}"
CA="${E2E_FEMA_REAL_CA:-$(dirname "${FIXTURES}")/tls/ca.pem}"
export E2E_SLOT="${SLOT}" E2E_STATE_ROOT="${E2E_STATE_ROOT:-/tmp/fema-e2e}" E2E_FEMA_REAL_FIXTURES="${FIXTURES}"
export E2E_PUBLIC_URL="${PUBLIC_URL}" SAAS_WEB_URL="${PUBLIC_URL}" NODE_EXTRA_CA_CERTS="${CA}"
export FEMA_SSRF_ALLOW_LIST="${FEMA_SSRF_ALLOW_LIST:-127.0.0.1,::1}"
STATE_DIR="${E2E_STATE_ROOT}/slot-${SLOT}"
WEB_PORT=$((4200 + SLOT))
cd "${ROOT}"

stop_port() {
  local pids
  pids="$(lsof -nP -tiTCP:"$1" -sTCP:LISTEN || true)"
  if [ -n "${pids}" ]; then
    kill ${pids}
  fi
}

npx turbo run build --filter=@fema-ipaas/connector-fema --filter=@fema-ipaas/shared --filter=@fema-ipaas/core-utils --filter=@fema-ipaas/engine

for port in $((3100 + SLOT)) "${WEB_PORT}" $((18900 + SLOT)); do
  stop_port "${port}"
done
while lsof -nP -tiTCP:$((3100 + SLOT)) -sTCP:LISTEN >/dev/null 2>&1; do sleep 1; done
rm -rf "${STATE_DIR}/config/pglite"
bash tools/e2e/stack/start-stack.sh "${SLOT}"
for _ in $(seq 1 120); do
  if curl -s --noproxy '*' -o /dev/null "http://localhost:${WEB_PORT}/" && curl -s --noproxy '*' -o /dev/null "http://localhost:$((3100 + SLOT))/v1/flags"; then break; fi
  sleep 2
done
curl -sf --cacert "${CA}" -o /dev/null "${PUBLIC_URL}/" || { echo "TLS proxy ${PUBLIC_URL} does not reach web on ${WEB_PORT}" >&2; exit 2; }
bash tools/e2e/stack/start-worker.sh "${SLOT}"

status=0
node tools/e2e/real/fema-federation.mjs || status=1
bash tools/e2e/stack/stop-worker.sh "${SLOT}"
exit "${status}"
