import { EntityId } from '@fema-ipaas/core-utils'
import { ExecutionStatus, PauseType, RespondResponse, WaitpointVersion } from '@fema-ipaas/shared'

enum WaitpointStatus {
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED',
}

enum WaitpointVersionEnum {
    V0 = 'V0',
    V1 = 'V1',
}

type WaitpointResumePayload = {
    body?: unknown
    headers?: Record<string, string>
    queryParams?: Record<string, string>
} | null

type Waitpoint = {
    id: EntityId
    created: string
    updated: string
    executionId: EntityId
    workspaceId: EntityId
    type: `${PauseType}`
    version: WaitpointVersion
    status: WaitpointStatus
    stepName: string
    resumeDateTime: string | null
    responseToSend: RespondResponse | null
    workerHandlerId: string | null
    httpRequestId: string | null
    resumePayload: WaitpointResumePayload | null
}

type CreateForPauseParams = {
    executionId: EntityId
    workspaceId: EntityId
    stepName: string
    type: `${PauseType}`
    version: WaitpointVersion
    resumeDateTime?: string
    responseToSend?: RespondResponse
    workerHandlerId?: string
    httpRequestId?: string
}

type CreateForPauseResult = {
    inserted: boolean
    waitpoint: Waitpoint
}

type CompleteParams = {
    executionId: EntityId
    workspaceId: EntityId
    waitpointId: EntityId
    resumePayload: WaitpointResumePayload
    workerHandlerId?: string
}

type CompleteResult = {
    completedExisting: boolean
    waitpoint: Waitpoint | null
}

type HandleResumeSignalParams = {
    executionId: EntityId
    waitpointId: EntityId
    executionStatus: ExecutionStatus
    workspaceId: EntityId
    resumePayload: WaitpointResumePayload
    workerHandlerId?: string
    onReady: (waitpoint: Waitpoint) => Promise<void>
}

type FindPendingByVersionParams = {
    executionId: EntityId
    version: WaitpointVersion
}

export { WaitpointStatus, WaitpointVersionEnum }
export type { Waitpoint, WaitpointResumePayload, CreateForPauseParams, CreateForPauseResult, CompleteParams, CompleteResult, FindPendingByVersionParams, HandleResumeSignalParams }
