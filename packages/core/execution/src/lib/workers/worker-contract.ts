import { StreamStepProgress } from '../engine/engine-operation'
import { GetFlowVersionForWorkerRequest, UploadRunLogsRequest } from '../engine/requests'
import { FlowRun, RunEnvironment } from '../flow-run/flow-run'
import { FlowVersion } from '../flows/flow-version'
import { TriggerRunStatus } from '../flows/triggers/trigger-run'
import { ConsumeJobRequest, ConsumeJobResponse, WorkerMachineHealthcheckRequest } from './index'

export type SubmitPayloadsRequest = {
    flowVersionId: string
    projectId: string
    payloads: unknown[]
    httpRequestId?: string
    environment: RunEnvironment
    streamStepProgress: StreamStepProgress
    parentRunId?: string
    failParentOnFailure?: boolean
}

export type SavePayloadRequest = {
    flowId: string
    flowVersionId: string
    projectId: string
    payloads: unknown[]
}

export type GetPieceRequest = {
    name: string
    version?: string
    projectId?: string
    platformId?: string
}

export type GetFlowBundleRequest = {
    flowVersionId: string
    projectId: string
}

export type GetFlowBundleResponse =
    | { kind: 'inline', data: Buffer }
    | { kind: 'url', url: string }

export type PrepareFlowBundleUploadRequest = {
    flowVersionId: string
    projectId: string
    platformId: string
    size: number
}

export type PrepareFlowBundleUploadResponse =
    | { kind: 'url', url: string }
    | { kind: 'inline' }
    | { kind: 'skip' }

export type UploadFlowBundleRequest = {
    flowVersionId: string
    projectId: string
    platformId: string
    data: Buffer
}

export type RecordTriggerRunRequest = {
    platformId: string
    pieceName: string
    status: TriggerRunStatus
}

export type WorkerToApiContract = {
    poll(input: WorkerMachineHealthcheckRequest): Promise<ConsumeJobRequest | null>
    completeJob(input: ConsumeJobResponse & { jobId: string, token: string, queueName: string }): Promise<void>
    uploadRunLog(input: UploadRunLogsRequest): Promise<void>
    submitPayloads(input: SubmitPayloadsRequest): Promise<FlowRun[]>
    savePayloads(input: SavePayloadRequest): Promise<void>
    getFlowVersion(input: GetFlowVersionForWorkerRequest): Promise<FlowVersion | null>
    getPiece(input: GetPieceRequest): Promise<unknown>
    getPrewarmData(input: PrewarmDataRequest): Promise<PrewarmDataResponse>
    getPieceArchive(input: { archiveId: string }): Promise<Buffer>
    getFlowBundle(input: GetFlowBundleRequest): Promise<GetFlowBundleResponse | null>
    prepareFlowBundleUpload(input: PrepareFlowBundleUploadRequest): Promise<PrepareFlowBundleUploadResponse>
    uploadFlowBundle(input: UploadFlowBundleRequest): Promise<void>
    recordTriggerRun(input: RecordTriggerRunRequest): Promise<void>
    extendLock(input: { jobId: string, token: string, queueName: string }): Promise<void>
    disableFlow(input: DisableFlowRequest): Promise<void>
    resumeFlowStep(input: ResumeFlowStepRequest): Promise<void>
    updateFlowStepProgress(input: UpdateFlowStepProgressRequest): Promise<void>
}

export type UpdateFlowStepProgressRequest = {
    conversationId: string
    flowRunId: string
    output: unknown
    sequence: number
}

export type ResumeFlowStepRequest = {
    conversationId: string
    flowRunId: string
    waitpointId: string
    output: unknown
}

export type DisableFlowRequest = {
    flowId: string
    projectId: string
}

export type PrewarmDataRequest = {
    workerGroupId: string | undefined
    projectWorker: boolean | undefined
    flow?: { id: string, versionId: string, projectId: string }
}

export type PrewarmDataResponse = {
    flows: { id: string, versionId: string, projectId: string }[]
    platformId: string
    engineToken: string
}

export type ApiToWorkerContract = {
    flowPublished(input: { flowId: string, flowVersionId: string, projectId: string }): void
}
