#!/bin/sh

if [ "$#" -gt 0 ]; then
    exec "$@"
fi

export FEMA_CONTAINER_TYPE="${FEMA_CONTAINER_TYPE:-WORKER_AND_APP}"
export FEMA_PORT="${FEMA_PORT:-80}"

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
            { expiresIn: '100y', keyid: '1', algorithm: 'HS256', issuer: 'activepieces' }
        );
        process.stdout.write(token);
    ")
fi

APP_SCRIPT="packages/server/api/dist/src/bootstrap.js"
WORKER_SCRIPT="packages/server/worker/dist/src/bootstrap.js"

echo "Starting Activepieces (${FEMA_CONTAINER_TYPE} mode)"

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
