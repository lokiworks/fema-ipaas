#!/usr/bin/env bash
set -euo pipefail

SLOT="${1:?usage: start-prod-stack.sh <slot 1-9>}"
API_PORT="${PROD_API_PORT:-$((3100 + SLOT))}"
MOCK_PORT=$((18900 + SLOT))
PG_PORT=$((55440 + SLOT))
REDIS_PORT=$((56440 + SLOT))
STATE_DIR="${E2E_STATE_ROOT:-/tmp/fema-e2e}/slot-${SLOT}"
PROD_ROOT="${PROD_ROOT:-${STATE_DIR}/run}"
PROD_DB="${PROD_DB:-postgres}"
PROD_REDIS="${PROD_REDIS:-real}"
PROD_EXEC_MODE="${PROD_EXEC_MODE:-SANDBOX_CODE_ONLY}"
PROD_WORKER="${PROD_WORKER:-1}"
PROD_WORKER_COUNT="${PROD_WORKER_COUNT:-1}"
PROD_MOCK="${PROD_MOCK:-1}"
PROD_FRESH="${PROD_FRESH:-0}"
PROD_ZERO="${PROD_ZERO:-0}"
PROD_MOCK_ENV="${PROD_MOCK_ENV:-1}"
DB_NAME="${PROD_DB_NAME:-fema_prod}"
DB_PASSWORD="${PROD_DB_PASSWORD:-femapw}"
JWT_SECRET="${PROD_JWT_SECRET:-8f3a1c5e7b9d2046a8c1e3f5071b9d2c4e6f80a1b3c5d7e9f102a4c6e8b0d2f4}"
ENCRYPTION_KEY="${PROD_ENCRYPTION_KEY:-5b1e9c3a7d2f40869e0c4a8b6d1f3e57}"
LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LC_ALL

mkdir -p "${STATE_DIR}"

stop_port() {
  local pids
  pids="$(lsof -nP -tiTCP:"$1" -sTCP:LISTEN || true)"
  if [ -n "${pids}" ]; then
    kill ${pids}
  fi
}

wait_port() {
  for _ in $(seq 1 60); do
    if lsof -nP -tiTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "port $1 did not open" >&2
  return 1
}

start_postgres() {
  if lsof -nP -tiTCP:"${PG_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    return 0
  fi
  if [ ! -d "${STATE_DIR}/pg" ]; then
    printf '%s' "${DB_PASSWORD}" >"${STATE_DIR}/pg.pw"
    initdb -D "${STATE_DIR}/pg" -U fema -A scram-sha-256 --pwfile="${STATE_DIR}/pg.pw" -E UTF8 >"${STATE_DIR}/initdb.log" 2>&1
  fi
  pg_ctl -D "${STATE_DIR}/pg" -o "-p ${PG_PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${STATE_DIR}" -l "${STATE_DIR}/pg.log" -w start >/dev/null
  PGPASSWORD="${DB_PASSWORD}" psql -h 127.0.0.1 -p "${PG_PORT}" -U fema -d postgres -tc "select 1 from pg_database where datname='${DB_NAME}'" | grep -q 1 \
    || PGPASSWORD="${DB_PASSWORD}" psql -h 127.0.0.1 -p "${PG_PORT}" -U fema -d postgres -c "create database ${DB_NAME}" >/dev/null
}

start_redis() {
  if lsof -nP -tiTCP:"${REDIS_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    return 0
  fi
  local binary
  binary="$(ls "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"/node_modules/.cache/redis-memory-server/redis-binaries/*/redis-server | head -1)"
  mkdir -p "${STATE_DIR}/redis"
  (cd "${STATE_DIR}/redis" && nohup "${binary}" --port "${REDIS_PORT}" --bind 127.0.0.1 --dir "${STATE_DIR}/redis" --save "" --appendonly no >"${STATE_DIR}/redis.log" 2>&1 &)
  wait_port "${REDIS_PORT}"
}

unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy

if [ "${PROD_ZERO}" != "1" ] && [ "${PROD_DB}" = "postgres" ]; then
  start_postgres
fi
if [ "${PROD_ZERO}" != "1" ] && [ "${PROD_REDIS}" = "real" ]; then
  start_redis
fi

if [ -f "${STATE_DIR}/worker.pid" ]; then
  kill $(cat "${STATE_DIR}/worker.pid") 2>/dev/null || true
fi
stop_port "${API_PORT}"
for _ in $(seq 1 120); do
  alive=0
  for pid in $(cat "${STATE_DIR}/worker.pid" "${STATE_DIR}/api.pid" 2>/dev/null); do
    if kill -0 "${pid}" 2>/dev/null; then
      alive=1
    fi
  done
  if [ "${alive}" = "0" ] && ! lsof -nP -tiTCP:"${API_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [ "${PROD_FRESH}" = "1" ]; then
  rm -rf "${STATE_DIR}/config"
  if [ "${PROD_ZERO}" != "1" ] && [ "${PROD_DB}" = "postgres" ]; then
    PGPASSWORD="${DB_PASSWORD}" psql -h 127.0.0.1 -p "${PG_PORT}" -U fema -d postgres -c "drop database if exists ${DB_NAME} with (force)" -c "create database ${DB_NAME}" >/dev/null
  fi
fi
mkdir -p "${STATE_DIR}/config" "${STATE_DIR}/worker-cache"

if [ "${PROD_MOCK}" = "1" ] && ! lsof -nP -tiTCP:"${MOCK_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  (cd "${PROD_ROOT}" && MOCK_PORT="${MOCK_PORT}" nohup node "${E2E_MOCK_SCRIPT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../main-line" && pwd)/mock-server.mjs}" >"${STATE_DIR}/mock.log" 2>&1 &)
  wait_port "${MOCK_PORT}"
fi

cd "${PROD_ROOT}"

export NODE_ENV=production
export FEMA_PORT="${API_PORT}"
export FEMA_CONFIG_PATH="${STATE_DIR}/config"

if [ "${PROD_ZERO}" = "1" ]; then
  export FEMA_DB_TYPE=PGLITE
  export FEMA_REDIS_TYPE=MEMORY
else
  export FEMA_ENVIRONMENT=prod
  export FEMA_FRONTEND_URL="${FEMA_FRONTEND_URL:-http://localhost:${API_PORT}}"
  export FEMA_JWT_SECRET="${JWT_SECRET}"
  export FEMA_ENCRYPTION_KEY="${ENCRYPTION_KEY}"
  export FEMA_EXECUTION_MODE="${PROD_EXEC_MODE}"
  export FEMA_CACHE_BASE_PATH="${STATE_DIR}/worker-cache"
  export FEMA_WORKER_CONCURRENCY="${FEMA_WORKER_CONCURRENCY:-2}"
  if [ "${PROD_DB}" = "postgres" ]; then
    export FEMA_DB_TYPE=POSTGRES
    export FEMA_POSTGRES_HOST=127.0.0.1
    export FEMA_POSTGRES_PORT="${PG_PORT}"
    export FEMA_POSTGRES_DATABASE="${DB_NAME}"
    export FEMA_POSTGRES_USERNAME=fema
    export FEMA_POSTGRES_PASSWORD="${DB_PASSWORD}"
  else
    export FEMA_DB_TYPE=PGLITE
  fi
  if [ "${PROD_REDIS}" = "real" ]; then
    export FEMA_REDIS_TYPE=STANDALONE
    export FEMA_REDIS_HOST=127.0.0.1
    export FEMA_REDIS_PORT="${REDIS_PORT}"
  else
    export FEMA_REDIS_TYPE=MEMORY
  fi
fi

if [ "${PROD_MOCK_ENV}" = "1" ]; then
  export FEMA_BEISEN_BASE_URL="http://127.0.0.1:${MOCK_PORT}/beisen"
  export FEMA_FEISHU_BASE_URL="http://127.0.0.1:${MOCK_PORT}/feishu"
  export FEMA_SANDBOX_PROPAGATED_ENV_VARS="FEMA_BEISEN_BASE_URL,FEMA_FEISHU_BASE_URL"
  export FEMA_SSRF_ALLOW_LIST="${FEMA_SSRF_ALLOW_LIST:-127.0.0.1}"
  export FEMA_TRIGGER_DEFAULT_POLL_INTERVAL="${FEMA_TRIGGER_DEFAULT_POLL_INTERVAL:-1}"
fi

if [ "${PROD_ZERO}" = "1" ]; then
  FEMA_CONTAINER_TYPE=WORKER_AND_APP nohup ./docker-entrypoint.sh >"${STATE_DIR}/api.log" 2>&1 &
  echo $! >"${STATE_DIR}/api.pid"
  PROD_WORKER=0
else
  FEMA_CONTAINER_TYPE=APP nohup ./docker-entrypoint.sh >"${STATE_DIR}/api.log" 2>&1 &
  echo $! >"${STATE_DIR}/api.pid"
fi

for _ in $(seq 1 180); do
  if curl -s --noproxy '*' "http://localhost:${API_PORT}/api/v1/health/setup" | grep -q initialized; then
    break
  fi
  sleep 1
done

if [ "${PROD_WORKER}" = "1" ]; then
  : >"${STATE_DIR}/worker.pid"
  for index in $(seq 0 $((PROD_WORKER_COUNT - 1))); do
    suffix=""
    if [ "${index}" -gt 0 ]; then
      suffix="-${index}"
    fi
    if [ -n "${PROD_WORKER_BUNDLE:-}" ]; then
      worker_token="$(node -e "
        const jwt = require('jsonwebtoken');
        process.stdout.write(jwt.sign({ id: require('crypto').randomUUID(), type: 'WORKER' }, process.env.FEMA_JWT_SECRET, { expiresIn: '100y', keyid: '1', algorithm: 'HS256', issuer: 'fema' }));
      ")"
      (cd "${PROD_WORKER_BUNDLE}" && FEMA_WORKER_TOKEN="${worker_token}" FEMA_PORT=$((3190 + SLOT + index * 100)) FEMA_CONTAINER_TYPE=WORKER nohup node worker.js >"${STATE_DIR}/worker${suffix}.log" 2>&1 & echo $! >>"${STATE_DIR}/worker.pid")
    else
      FEMA_PORT=$((3190 + SLOT + index * 100)) FEMA_CONTAINER_TYPE=WORKER nohup ./docker-entrypoint.sh >"${STATE_DIR}/worker${suffix}.log" 2>&1 &
      echo $! >>"${STATE_DIR}/worker.pid"
    fi
  done
fi

cat >"${STATE_DIR}/ports.env" <<PORTS
API_URL=http://localhost:${API_PORT}
WEB_URL=http://localhost:${API_PORT}
MOCK_URL=http://127.0.0.1:${MOCK_PORT}
STATE_DIR=${STATE_DIR}
PORTS
cat "${STATE_DIR}/ports.env"
