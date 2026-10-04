#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:?usage: stop-stack.sh <slot 1-9>}"
for port in $((3100 + SLOT)) $((4200 + SLOT)) $((18900 + SLOT)); do
  pids="$(lsof -nP -tiTCP:"${port}" -sTCP:LISTEN || true)"
  if [ -n "${pids}" ]; then
    kill ${pids}
  fi
done
