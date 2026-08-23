
import { z } from 'zod'
import { StreamStepProgress } from '../../engine/engine-operation'

export enum ExecutionStatus {
    FAILED = 'FAILED',
    QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    PAUSED = 'PAUSED',
    QUEUED = 'QUEUED',
    RUNNING = 'RUNNING',
    SUCCEEDED = 'SUCCEEDED',
    MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED',
    TIMEOUT = 'TIMEOUT',
    CANCELED = 'CANCELED',
    LOG_SIZE_EXCEEDED = 'LOG_SIZE_EXCEEDED',
}

export enum PauseType {
    DELAY = 'DELAY',
    WEBHOOK = 'WEBHOOK',
}

export const DelayPauseMetadata = z.object({
    type: z.literal(PauseType.DELAY),
    resumeDateTime: z.string(),
    requestIdToReply: z.string().optional(),
    handlerId: z.string().optional(),
    streamStepProgress: z.nativeEnum(StreamStepProgress).optional(),
})

export type DelayPauseMetadata = z.infer<typeof DelayPauseMetadata>

export const RespondResponse = z.object({
    status: z.number().optional(),
    body: z.unknown().optional(),
    headers: z.record(z.string(), z.string()).optional(),
})

export type RespondResponse = z.infer<typeof RespondResponse>

export const StopResponse = z.object({
    status: z.number().optional(),
    body: z.unknown().optional(),
    headers: z.record(z.string(), z.string()).optional(),
})

export type StopResponse = z.infer<typeof StopResponse>

export const WebhookPauseMetadata = z.object({
    type: z.literal(PauseType.WEBHOOK),
    requestId: z.string(),
    requestIdToReply: z.string().optional(),
    response: RespondResponse,
    handlerId: z.string().optional(),
    streamStepProgress: z.nativeEnum(StreamStepProgress).optional(),
})
export type WebhookPauseMetadata = z.infer<typeof WebhookPauseMetadata>

export const PauseMetadata = z.union([DelayPauseMetadata, WebhookPauseMetadata])
export type PauseMetadata = z.infer<typeof PauseMetadata>

export const isExecutionStateTerminal = ({ status, ignoreInternalError }: { status: ExecutionStatus, ignoreInternalError: boolean }): boolean => {
    switch (status) {
        case ExecutionStatus.SUCCEEDED:
        case ExecutionStatus.TIMEOUT:
        case ExecutionStatus.FAILED:
        case ExecutionStatus.QUOTA_EXCEEDED:
        case ExecutionStatus.MEMORY_LIMIT_EXCEEDED:
        case ExecutionStatus.LOG_SIZE_EXCEEDED:
        case ExecutionStatus.CANCELED:
            return true
        case ExecutionStatus.INTERNAL_ERROR:
            return !ignoreInternalError
        case ExecutionStatus.QUEUED:
        case ExecutionStatus.RUNNING:
        case ExecutionStatus.PAUSED:
            return false
    }
}


export const FAILED_STATES = [
    ExecutionStatus.FAILED,
    ExecutionStatus.INTERNAL_ERROR,
    ExecutionStatus.QUOTA_EXCEEDED,
    ExecutionStatus.TIMEOUT,
    ExecutionStatus.MEMORY_LIMIT_EXCEEDED,
]
export const isFailedState = (status: ExecutionStatus): boolean => {
    return FAILED_STATES.includes(status)
}
