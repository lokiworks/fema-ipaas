import { ErrorCode, PlatformError, SandboxExecutionTimeoutParams } from '@fema/core-utils'

export function isSandboxTimeout(e: unknown): e is PlatformError & { error: SandboxExecutionTimeoutParams } {
    return e instanceof PlatformError && e.error.code === ErrorCode.SANDBOX_EXECUTION_TIMEOUT
}
