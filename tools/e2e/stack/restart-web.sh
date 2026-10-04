#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:?usage: restart-web.sh <slot 1-9>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_PORT=$((3100 + SLOT))
WEB_PORT=$((4200 + SLOT))
STATE_DIR="${E2E_STATE_ROOT:-/tmp/fema-e2e}/slot-${SLOT}"

pids="$(lsof -nP -tiTCP:"${WEB_PORT}" -sTCP:LISTEN || true)"
if [ -n "${pids}" ]; then
  kill ${pids}
fi
sleep 2

cd "${ROOT}"
FEMA_DEV_API_PORT="${API_PORT}" FEMA_DEV_WEB_PORT="${WEB_PORT}" nohup npm --prefix packages/web run serve >"${STATE_DIR}/web.log" 2>&1 &
echo $! >"${STATE_DIR}/web.pid"

for _ in $(seq 1 90); do
  if curl -s -o /dev/null -m 5 "http://localhost:${WEB_PORT}/"; then
    echo "web up on ${WEB_PORT}"
    exit 0
  fi
  sleep 2
done
echo "web did not come up on ${WEB_PORT}" >&2
exit 1
