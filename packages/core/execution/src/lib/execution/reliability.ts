import { blockedUntilMarker, isNil } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export const reliabilityUtils = {
    rateLimitWaitMs,
    eventKey,
}

function rateLimitWaitMs({ message, now }: { message: string | undefined, now: number }): number | null {
    const until = blockedUntilMarker.parse(message)
    if (isNil(until)) {
        return null
    }
    const waitMs = Math.max(until.getTime() - now, MIN_RATE_LIMIT_WAIT_MS)
    return waitMs <= RATE_LIMIT_QUEUE.maxWaitMs ? waitMs : null
}

function eventKey({ executionId, stepName, path, kind, sequence }: EventKeyParams): string {
    return [executionId, stepName, path.map(([loopName, iteration]) => `${loopName}.${iteration}`).join('/'), kind, sequence].join(':')
}

export enum ReliabilityEventKind {
    RATE_LIMIT_QUEUED = 'RATE_LIMIT_QUEUED',
    AUTO_RETRY = 'AUTO_RETRY',
    RETRY_WITHHELD = 'RETRY_WITHHELD',
    CATCH_UP = 'CATCH_UP',
}

export const EngineReliabilityEventKind = z.enum([ReliabilityEventKind.RATE_LIMIT_QUEUED, ReliabilityEventKind.AUTO_RETRY, ReliabilityEventKind.RETRY_WITHHELD])
export type EngineReliabilityEventKind = z.infer<typeof EngineReliabilityEventKind>

export const ReliabilityEventReport = z.object({
    eventKey: z.string(),
    kind: EngineReliabilityEventKind,
    stepName: z.string(),
    workflowId: z.string(),
    errorCode: z.string().optional(),
    reason: z.enum(['UNSAFE_OUTCOME_UNKNOWN', 'DEDUPE_WINDOW_PASSED']).optional(),
    connectorName: z.string().optional(),
    waitSeconds: z.number().optional(),
})
export type ReliabilityEventReport = z.infer<typeof ReliabilityEventReport>

export type PendingReliabilityEvent = Omit<ReliabilityEventReport, 'eventKey' | 'workflowId' | 'stepName'>

export const RATE_LIMIT_QUEUE = {
    maxWaitMs: 30_000,
    maxAttempts: 3,
}

const MIN_RATE_LIMIT_WAIT_MS = 1_000

type EventKeyParams = {
    executionId: string
    stepName: string
    path: readonly (readonly [string, number])[]
    kind: ReliabilityEventKind
    sequence: string | number
}
