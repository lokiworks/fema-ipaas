
function env(prop: string) {
    return process.env[prop]
}

function getApiUrl(): string {
    const containerType = system.get(WorkerSystemProp.CONTAINER_TYPE) ?? 'WORKER_AND_APP'
    if (containerType === 'WORKER_AND_APP') {
        const port = process.env[WorkerSystemProp.PORT] ?? system.get(WorkerSystemProp.PORT)
        return `http://127.0.0.1:${port}/api/`
    }
    const frontendUrl = system.getOrThrow(WorkerSystemProp.FRONTEND_URL).replace(/\/+$/, '')
    return frontendUrl + '/api/'
}

function getSocketUrl(): { url: string, path: string } {
    const containerType = system.get(WorkerSystemProp.CONTAINER_TYPE) ?? 'WORKER_AND_APP'
    if (containerType === 'WORKER_AND_APP') {
        const port = process.env[WorkerSystemProp.PORT] ?? system.get(WorkerSystemProp.PORT)
        return { url: `http://127.0.0.1:${port}`, path: '/api/socket.io' }
    }
    const frontendUrl = system.getOrThrow(WorkerSystemProp.FRONTEND_URL).replace(/\/+$/, '')
    return { url: frontendUrl, path: '/api/socket.io' }
}

export enum WorkerSystemProp {
    FRONTEND_URL = 'FEMA_FRONTEND_URL',
    CONTAINER_TYPE = 'FEMA_CONTAINER_TYPE',
    ENVIRONMENT = 'FEMA_ENVIRONMENT',
    WORKER_TOKEN = 'FEMA_WORKER_TOKEN',
    PORT = 'FEMA_PORT',
    LOG_FILE = 'FEMA_LOG_FILE',
    LOG_LEVEL = 'FEMA_LOG_LEVEL',
    LOG_PRETTY = 'FEMA_LOG_PRETTY',
    LOG_SAMPLE_RATE_INFO = 'FEMA_LOG_SAMPLE_RATE_INFO',
    LOG_KEEP_SLOW_MS = 'FEMA_LOG_KEEP_SLOW_MS',
    OTEL_ENABLED = 'FEMA_OTEL_ENABLED',
    HYPERDX_TOKEN = 'FEMA_HYPERDX_TOKEN',
    AXIOM_TOKEN = 'FEMA_AXIOM_TOKEN',
    AXIOM_DATASET = 'FEMA_AXIOM_DATASET',
    LOKI_URL = 'FEMA_LOKI_URL',
    LOKI_USERNAME = 'FEMA_LOKI_USERNAME',
    LOKI_PASSWORD = 'FEMA_LOKI_PASSWORD',
    BETTERSTACK_TOKEN = 'FEMA_BETTERSTACK_TOKEN',
    BETTERSTACK_HOST = 'FEMA_BETTERSTACK_HOST',
    LOAD_TRANSLATIONS_FOR_DEV_PIECES = 'FEMA_LOAD_TRANSLATIONS_FOR_DEV_PIECES',
    WORKER_GROUP_ID = 'FEMA_WORKER_GROUP_ID',
    PROJECT_WORKER = 'FEMA_PROJECT_WORKER',
    WORKER_CONCURRENCY = 'FEMA_WORKER_CONCURRENCY',
    EXECUTION_MODE = 'FEMA_EXECUTION_MODE',
    REUSE_SANDBOX = 'FEMA_REUSE_SANDBOX',
    CACHE_BASE_PATH = 'FEMA_CACHE_BASE_PATH',
}

const defaultValues: Partial<Record<WorkerSystemProp, string>> = {
    [WorkerSystemProp.PORT]: '3000',
    [WorkerSystemProp.LOG_LEVEL]: 'info',
    [WorkerSystemProp.LOG_PRETTY]: 'false',
    [WorkerSystemProp.LOG_FILE]: 'false',
    [WorkerSystemProp.OTEL_ENABLED]: 'false',
    // Transitional default (ADR 0004): N boxes per worker preserves main's historical behavior.
    // The destination is concurrency 1 + horizontal replicas (ADR 0003).
    [WorkerSystemProp.WORKER_CONCURRENCY]: '5',
    [WorkerSystemProp.CACHE_BASE_PATH]: 'cache',
}

export const system = {
    get(prop: WorkerSystemProp): string | undefined {
        return env(prop) ?? defaultValues[prop]
    },
    getOrThrow(prop: WorkerSystemProp): string {
        const value = env(prop)
        if (!value) {
            throw new Error(`Environment variable ${prop} is not set`)
        }
        return value
    },
    getBoolean(prop: WorkerSystemProp): boolean | undefined {
        const value = env(prop) ?? defaultValues[prop]
        return value ? value === 'true' : undefined
    },
    getList(prop: WorkerSystemProp): string[] {
        const value = env(prop) ?? defaultValues[prop]
        return value ? value.split(',').map(s => s.trim()).filter(Boolean) : []
    },
}

export { getApiUrl, getSocketUrl }
