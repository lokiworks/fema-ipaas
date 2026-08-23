import { ApplicationError, ErrorCode, SandboxExecutionTimeoutParams } from '@fema/core-utils'

export function isSandboxTimeout(e: unknown): e is ApplicationError & { error: SandboxExecutionTimeoutParams } {
    return e instanceof ApplicationError && e.error.code === ErrorCode.SANDBOX_EXECUTION_TIMEOUT
}
