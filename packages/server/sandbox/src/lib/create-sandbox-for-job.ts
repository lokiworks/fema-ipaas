import { type ApLogger } from '@fema/server-utils'
import { ExecutionMode, maxSocketHttpBufferSizeBytes, NetworkMode } from '@fema/shared'
import { nanoid } from 'nanoid'
import { cacheUtils } from './cache/cache-paths'
import { sandboxCapacity } from './sandbox/capacity'
import { simpleProcess } from './sandbox/fork'
import { isolateProcess } from './sandbox/isolate'
import { createSandbox } from './sandbox/sandbox'
import { Sandbox, SandboxMount } from './sandbox/types'
import { SandboxSettings } from './types'

export function createSandboxForJob(params: {
    log: ApLogger
    boxId: number
    reusable: boolean
    basePath: string
    getSettings: () => SandboxSettings
}): Sandbox {
    const { log, boxId, reusable, basePath, getSettings } = params
    const settings = getSettings()
    const sandboxId = nanoid()
    const paths = cacheUtils(basePath)

    const memoryLimitMb = parseMemoryLimit(settings.SANDBOX_MEMORY_LIMIT)
    const processMaker = getProcessMaker(settings.EXECUTION_MODE, log, boxId, paths)

    const baseMounts: SandboxMount[] = [
        { hostPath: paths.getGlobalCacheCommonPath(), sandboxPath: '/root/common' },
    ]

    const executionMode = settings.EXECUTION_MODE as ExecutionMode

    return createSandbox(
        log,
        sandboxId,
        {
            env: buildSandboxEnv({ settings }),
            memoryLimitMb,
            cpuMsPerSec: 1000,
            timeLimitSeconds: settings.WORKFLOW_TIMEOUT_SECONDS,
            reusable,
            maxHttpBufferSizeBytes: maxSocketHttpBufferSizeBytes(settings.MAX_FILE_SIZE_MB),
            basePath,
            baseMounts,
            wsRpcPort: isIsolateMode(executionMode) ? sandboxCapacity.wsRpcPortForBox(boxId) : undefined,
        },
        processMaker,
    )
}

export function isIsolateMode(mode: ExecutionMode): boolean {
    return mode === ExecutionMode.SANDBOX_PROCESS || mode === ExecutionMode.SANDBOX_CODE_AND_PROCESS
}

function getProcessMaker(executionMode: string, log: ApLogger, boxId: number, paths: ReturnType<typeof cacheUtils>) {
    switch (executionMode) {
        case ExecutionMode.SANDBOX_PROCESS:
        case ExecutionMode.SANDBOX_CODE_AND_PROCESS:
            return isolateProcess(log, paths.getEnginePath(), paths.getGlobalCodeCachePath(), boxId)
        case ExecutionMode.UNSANDBOXED:
        case ExecutionMode.SANDBOX_CODE_ONLY:
        default:
            return simpleProcess(paths.getEnginePath(), paths.getGlobalCodeCachePath())
    }
}

function parseMemoryLimit(memoryLimitKb: string): number {
    const parsed = parseInt(memoryLimitKb, 10)
    const kb = isNaN(parsed) ? 1048576 : parsed
    return Math.floor(kb / 1024)
}

function buildSandboxEnv({ settings }: {
    settings: SandboxSettings
}): Record<string, string> {
    // STRICT enables the engine's in-process ssrfGuard (best-effort dns + socket
    // guards only — there is no longer an egress proxy or kernel firewall). The hard
    // egress boundary now lives in infrastructure (e.g. the Cloud VPC firewall).
    const networkMode = settings.NETWORK_MODE
    return {
        ...baseEnv({ settings, networkMode }),
        ...ssrfEnv(settings),
        ...propagatedEnv(settings),
    }
}

function baseEnv({ settings, networkMode }: { settings: SandboxSettings, networkMode: NetworkMode }): Record<string, string> {
    return {
        HOME: '/tmp/',
        FEMA_EXECUTION_MODE: settings.EXECUTION_MODE,
        FEMA_MAX_EXECUTION_LOG_SIZE_MB: String(settings.MAX_EXECUTION_LOG_SIZE_MB),
        FEMA_MAX_FILE_SIZE_MB: String(settings.MAX_FILE_SIZE_MB),
        NODE_PATH: '/usr/src/node_modules',
        FEMA_NETWORK_MODE: networkMode,
        ...(settings.ENFORCE_CONNECTION_CONNECTOR_BINDING ? { FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING: 'true' } : {}),
    }
}

function ssrfEnv(settings: SandboxSettings): Record<string, string> {
    const env: Record<string, string> = {}
    if (settings.DEV_CONNECTORS.length > 0) {
        env['FEMA_DEV_CONNECTORS'] = settings.DEV_CONNECTORS.join(',')
    }
    if (settings.SSRF_ALLOW_LIST.length > 0) {
        env['FEMA_SSRF_ALLOW_LIST'] = settings.SSRF_ALLOW_LIST.join(',')
    }
    return env
}

function propagatedEnv(settings: SandboxSettings): Record<string, string> {
    const env: Record<string, string> = {}
    for (const key of settings.SANDBOX_PROPAGATED_ENV_VARS) {
        if (process.env[key]) {
            env[key] = process.env[key]!
        }
    }
    return env
}
