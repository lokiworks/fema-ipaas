#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:-${E2E_SLOT:-3}}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
STATE_ROOT="${E2E_STATE_ROOT:-/tmp/fema-e2e}"
STATE_DIR="${STATE_ROOT}/slot-${SLOT}"
IAM_PORT="${FEMA_IAM_PORT:-$((19300 + SLOT))}"
WEB_PORT=$((4200 + SLOT))
PW_IMAGE="${SAAS_PW_IMAGE:-mcr.microsoft.com/playwright:v1.54.1-noble}"
BROWSER="${SAAS_BROWSER:-container}"
OUT="${SAAS_SCREENS_DIR:-${STATE_DIR}/ui-shots}"
export E2E_SLOT="${SLOT}" E2E_STATE_ROOT="${STATE_ROOT}" FEMA_IAM_PORT="${IAM_PORT}"

cd "${ROOT}"
mkdir -p "${OUT}"

stop_port() {
  local pids
  pids="$(lsof -nP -tiTCP:"$1" -sTCP:LISTEN || true)"
  if [ -n "${pids}" ]; then
    kill ${pids}
  fi
}

if ! curl -s --noproxy '*' -o /dev/null "http://localhost:${WEB_PORT}/"; then
  echo "web on ${WEB_PORT} is not up; start the stack first: bash tools/e2e/stack/start-stack.sh ${SLOT}" >&2
  exit 2
fi

stop_port "${IAM_PORT}"
sleep 1
nohup node tools/e2e/mocks/fema-iam.mjs >"${STATE_DIR}/fema-iam.log" 2>&1 &
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

mkdir -p "${STATE_DIR}/saml-cert"
if [ ! -f "${STATE_DIR}/saml-cert/cert.der" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "${STATE_DIR}/saml-cert/key.pem" -out "${STATE_DIR}/saml-cert/cert.der" -outform DER -days 365 -subj /CN=idp.alpha.test >/dev/null 2>&1
fi

if ! curl -s --noproxy '*' -o /dev/null "http://127.0.0.1:${IAM_PORT}/"; then
  echo "fema-iam mock on ${IAM_PORT} is not answering; restarting it" >&2
  nohup node tools/e2e/mocks/fema-iam.mjs >>"${STATE_DIR}/fema-iam.log" 2>&1 &
  for _ in $(seq 1 30); do
    if curl -s --noproxy '*' -o /dev/null "http://127.0.0.1:${IAM_PORT}/"; then break; fi
    sleep 0.5
  done
fi

status=0
if [ "${BROWSER}" = "local" ]; then
  SAAS_SCREENS_DIR="${OUT}" SAAS_SCREENS_ONLY="${SAAS_SCREENS_ONLY:-}" SAAS_SCREENS_THEMES="${SAAS_SCREENS_THEMES:-light,dark}" \
    node tools/e2e/scenarios/saas/saas-screens.mjs || status=1
else
  docker run --rm --network host --ipc=host \
    -v "${ROOT}:${ROOT}" -v "${STATE_ROOT}:${STATE_ROOT}" -w "${ROOT}" \
    -e E2E_SLOT="${SLOT}" -e E2E_STATE_ROOT="${STATE_ROOT}" -e FEMA_IAM_PORT="${IAM_PORT}" \
    -e SAAS_SCREENS_DIR="${OUT}" -e SAAS_SCREENS_ONLY="${SAAS_SCREENS_ONLY:-}" -e SAAS_SCREENS_THEMES="${SAAS_SCREENS_THEMES:-light,dark}" \
    "${PW_IMAGE}" node tools/e2e/scenarios/saas/saas-screens.mjs || status=1
fi

stop_port "${IAM_PORT}"
echo "screens: ${OUT}"
exit "${status}"
