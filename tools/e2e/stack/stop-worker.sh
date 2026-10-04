#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:?usage: stop-worker.sh <slot 1-9>}"
STATE_DIR="${E2E_STATE_ROOT:-/tmp/fema-e2e}/slot-${SLOT}"
PID_FILE="${STATE_DIR}/worker.pid"

descendants() {
  local parent="$1"
  for child in $(pgrep -P "${parent}" || true); do
    descendants "${child}"
    echo "${child}"
  done
}

if [ -f "${PID_FILE}" ]; then
  root="$(cat "${PID_FILE}")"
  for pid in $(descendants "${root}") "${root}"; do
    kill "${pid}" 2>/dev/null || true
  done
  rm -f "${PID_FILE}"
fi
