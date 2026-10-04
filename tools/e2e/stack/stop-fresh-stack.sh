#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:?usage: stop-fresh-stack.sh <slot 1-9>}"
WEB_PORT="${E2E_WEB_PORT:-$((4200 + SLOT))}"
for port in $((3100 + SLOT)) "${WEB_PORT}" $((18900 + SLOT)) $((25000 + SLOT * 10)); do
  pids="$(lsof -nP -tiTCP:"${port}" -sTCP:LISTEN || true)"
  if [ -n "${pids}" ]; then
    kill ${pids}
  fi
done
