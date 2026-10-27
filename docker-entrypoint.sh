#!/bin/sh

export FEMA_CONTAINER_TYPE="${FEMA_CONTAINER_TYPE:-WORKER_AND_APP}"
export FEMA_PORT="${FEMA_PORT:-80}"
redis_type_default=MEMORY
db_type_default=PGLITE
if [ -n "${FEMA_REDIS_URL:+x}${FEMA_REDIS_HOST:+x}${FEMA_REDIS_PORT:+x}${FEMA_REDIS_USER:+x}${FEMA_REDIS_PASSWORD:+x}" ]; then
    redis_type_default=STANDALONE
fi
if [ -n "${FEMA_POSTGRES_URL:+x}${FEMA_POSTGRES_HOST:+x}${FEMA_POSTGRES_PORT:+x}${FEMA_POSTGRES_USERNAME:+x}${FEMA_POSTGRES_PASSWORD:+x}${FEMA_POSTGRES_DATABASE:+x}" ]; then
    db_type_default=POSTGRES
fi
export FEMA_REDIS_TYPE="${FEMA_REDIS_TYPE:-$redis_type_default}"
export FEMA_DB_TYPE="${FEMA_DB_TYPE:-$db_type_default}"

if [ "$#" -gt 0 ]; then
    exec "$@"
fi

echo "FEMA_CONTAINER_TYPE: $FEMA_CONTAINER_TYPE"
echo "FEMA_PORT: $FEMA_PORT"

# Auto-generate worker token if not set and JWT secret is available
if [ -z "$FEMA_WORKER_TOKEN" ] && [ -n "$FEMA_JWT_SECRET" ]; then
    echo "Auto-generating FEMA_WORKER_TOKEN..."
    export FEMA_WORKER_TOKEN=$(node -e "
        const jwt = require('jsonwebtoken');
        const crypto = require('crypto');
        const token = jwt.sign(
            { id: crypto.randomUUID(), type: 'WORKER' },
            process.env.FEMA_JWT_SECRET,
            { expiresIn: '100y', keyid: '1', algorithm: 'HS256', issuer: 'fema' }
        );
        process.stdout.write(token);
    ")
fi

if [ -z "$FEMA_WORKER_TOKEN" ] && [ -z "$FEMA_JWT_SECRET" ] && [ "$FEMA_REDIS_TYPE" = "MEMORY" ] && [ "$FEMA_CONTAINER_TYPE" = "WORKER_AND_APP" ]; then
    echo "Creating the embedded worker token from the stored JWT secret..."
    export FEMA_WORKER_TOKEN=$(node -e "
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const crypto = require('crypto');
        const jwt = require('jsonwebtoken');
        const directory = process.env.FEMA_CONFIG_PATH || path.join(os.homedir(), '.fema');
        const file = path.join(directory, 'settings.json');
        let settings = {};
        if (fs.existsSync(file)) { settings = JSON.parse(fs.readFileSync(file, 'utf8')); }
        if (!settings.JWT_SECRET) {
            settings.JWT_SECRET = crypto.randomBytes(32).toString('base64');
            fs.mkdirSync(directory, { recursive: true });
            fs.writeFileSync(file, JSON.stringify(settings));
        }
        process.stdout.write(jwt.sign(
            { id: crypto.randomUUID(), type: 'WORKER' },
            settings.JWT_SECRET,
            { expiresIn: '100y', keyid: '1', algorithm: 'HS256', issuer: 'fema' }
        ));
    ")
fi

APP_SCRIPT="packages/server/api/dist/src/bootstrap.js"
WORKER_SCRIPT="packages/server/worker/dist/src/bootstrap.js"

echo "Starting FEMA Integration Platform (${FEMA_CONTAINER_TYPE} mode)"

case "$FEMA_CONTAINER_TYPE" in
    APP)
        exec node --enable-source-maps "$APP_SCRIPT"
        ;;
    WORKER)
        exec node --enable-source-maps "$WORKER_SCRIPT"
        ;;
    WORKER_AND_APP)
        FEMA_CONTAINER_TYPE=APP node --enable-source-maps "$APP_SCRIPT" &
        app_pid=$!
        for _ in $(seq 1 120); do
            if curl -fsS -o /dev/null "http://127.0.0.1:${FEMA_PORT}/api/v1/health" 2>/dev/null || ! kill -0 "$app_pid" 2>/dev/null; then
                break
            fi
            sleep 1
        done
        node --enable-source-maps "$WORKER_SCRIPT" &
        worker_pid=$!

        trap 'kill "$app_pid" "$worker_pid" 2>/dev/null' TERM INT

        while kill -0 "$app_pid" 2>/dev/null && kill -0 "$worker_pid" 2>/dev/null; do
            sleep 1
        done

        kill "$app_pid" "$worker_pid" 2>/dev/null
        exit 1
        ;;
    *)
        echo "Unknown FEMA_CONTAINER_TYPE: $FEMA_CONTAINER_TYPE" >&2
        exit 1
        ;;
esac
