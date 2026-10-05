#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:?usage: stop-prod-stack.sh <slot 1-9> [--deps]}"
STATE_DIR="${E2E_STATE_ROOT:-/tmp/fema-e2e}/slot-${SLOT}"

stop_port() {
  local pids
  pids="$(lsof -nP -tiTCP:"$1" -sTCP:LISTEN || true)"
  if [ -n "${pids}" ]; then
    kill ${pids}
  fi
}

for pidfile in worker.pid api.pid; do
  if [ -f "${STATE_DIR}/${pidfile}" ]; then
    kill "$(cat "${STATE_DIR}/${pidfile}")" 2>/dev/null || true
  fi
done
stop_port $((3100 + SLOT))
stop_port $((18900 + SLOT))

if [ "${2:-}" = "--deps" ]; then
  export LC_ALL="${LC_ALL:-en_US.UTF-8}"
  if [ -d "${STATE_DIR}/pg" ]; then
    pg_ctl -D "${STATE_DIR}/pg" -m fast stop >/dev/null 2>&1 || true
  fi
  stop_port $((56440 + SLOT))
fi
