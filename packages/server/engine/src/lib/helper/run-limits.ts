import { isNil } from '@fema-ipaas/core-utils'
import { ExecutionError, ExecutionErrorType } from '@fema-ipaas/shared'
import { utils } from '../utils'

function positiveNumber(raw: string | undefined): number | null {
    if (isNil(raw) || raw.trim().length === 0) {
        return null
    }
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : null
}

function maxNodesPerRun(): number | null {
    return positiveNumber(process.env.FEMA_MAX_NODES_PER_RUN)
}

function stepTimeoutMs(): number | null {
    const seconds = positiveNumber(process.env.FEMA_STEP_TIMEOUT_SECONDS)
    return isNil(seconds) ? null : Math.round(seconds * 1000)
}

function maxStepPayloadBytes(): number | null {
    const megabytes = positiveNumber(process.env.FEMA_MAX_STEP_PAYLOAD_MB)
    return isNil(megabytes) ? null : Math.round(megabytes * 1024 * 1024)
}

function exceedsNodeLimit({ stepsCount, limit }: { stepsCount: number, limit: number | null }): boolean {
    return !isNil(limit) && stepsCount > limit
}

function exceedsPayloadLimit({ bytes, limit }: { bytes: number, limit: number | null }): boolean {
    return !isNil(limit) && bytes > limit
}

function assertStepPayloadWithinLimit({ input, output }: { input: unknown, output: unknown }): void {
    const limit = maxStepPayloadBytes()
    if (isNil(limit)) {
        return
    }
    const bytes = utils.sizeof(input) + utils.sizeof(output)
    if (exceedsPayloadLimit({ bytes, limit })) {
        throw new ExecutionError(
            'StepPayloadLimitExceeded',
            `The step input and output together are ${formatMegabytes(bytes)} MB, above the ${formatMegabytes(limit)} MB limit per step (FEMA_MAX_STEP_PAYLOAD)`,
            ExecutionErrorType.USER,
        )
    }
}

function stepTimeoutError(timeoutMs: number): ExecutionError {
    return new ExecutionError(
        'StepTimeoutExceeded',
        `The step ran longer than ${Math.round(timeoutMs / 1000)} seconds and was stopped (FEMA_STEP_TIMEOUT)`,
        ExecutionErrorType.USER,
    )
}

function nodeLimitMessage(limit: number): string {
    return `The run executed more than ${limit} steps and was stopped (FEMA_MAX_NODES_PER_RUN)`
}

function formatMegabytes(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(1)
}

export const runLimits = {
    maxNodesPerRun,
    stepTimeoutMs,
    maxStepPayloadBytes,
    exceedsNodeLimit,
    exceedsPayloadLimit,
    assertStepPayloadWithinLimit,
    stepTimeoutError,
    nodeLimitMessage,
}
