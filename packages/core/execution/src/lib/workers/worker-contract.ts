import { StreamStepProgress } from '../engine/engine-operation'
import { GetFlowVersionForWorkerRequest, UploadRunLogsRequest } from '../engine/requests'
import { Execution, RunEnvironment } from '../execution/execution'
import { FlowVersion } from '../flows/flow-version'
import { TriggerRunStatus } from '../flows/triggers/trigger-run'
import { ConsumeJobRequest, ConsumeJobResponse, WorkerMachineHealthcheckRequest } from './index'

export type SubmitPayloadsRequest = {
    flowVersionId: string
    workspaceId: string
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
    workspaceId: string
    payloads: unknown[]
}

export type GetConnectorRequest = {
    name: string
    version?: string
    workspaceId?: string
    platformId?: string
}

export type GetFlowBundleRequest = {
    flowVersionId: string
    workspaceId: string
}

export type GetFlowBundleResponse =
    | { kind: 'inline', data: Buffer }
    | { kind: 'url', url: string }

export type PrepareFlowBundleUploadRequest = {
    flowVersionId: string
    workspaceId: string
    platformId: string
    size: number
}

export type PrepareFlowBundleUploadResponse =
    | { kind: 'url', url: string }
    | { kind: 'inline' }
    | { kind: 'skip' }

export type UploadFlowBundleRequest = {
    flowVersionId: string
    workspaceId: string
    platformId: string
    data: Buffer
}

export type RecordTriggerRunRequest = {
    platformId: string
    connectorName: string
    status: TriggerRunStatus
}

export type WorkerToApiContract = {
    poll(input: WorkerMachineHealthcheckRequest): Promise<ConsumeJobRequest | null>
    completeJob(input: ConsumeJobResponse & { jobId: string, token: string, queueName: string }): Promise<void>
    uploadRunLog(input: UploadRunLogsRequest): Promise<void>
    submitPayloads(input: SubmitPayloadsRequest): Promise<Execution[]>
    savePayloads(input: SavePayloadRequest): Promise<void>
    getFlowVersion(input: GetFlowVersionForWorkerRequest): Promise<FlowVersion | null>
    getConnector(input: GetConnectorRequest): Promise<unknown>
    getPrewarmData(input: PrewarmDataRequest): Promise<PrewarmDataResponse>
    getConnectorArchive(input: { archiveId: string }): Promise<Buffer>
    getFlowBundle(input: GetFlowBundleRequest): Promise<GetFlowBundleResponse | null>
    prepareFlowBundleUpload(input: PrepareFlowBundleUploadRequest): Promise<PrepareFlowBundleUploadResponse>
    uploadFlowBundle(input: UploadFlowBundleRequest): Promise<void>
    recordTriggerRun(input: RecordTriggerRunRequest): Promise<void>
    extendLock(input: { jobId: string, token: string, queueName: string }): Promise<void>
    disableFlow(input: DisableFlowRequest): Promise<void>
}

export type DisableFlowRequest = {
    flowId: string
    workspaceId: string
}

export type PrewarmDataRequest = {
    workerGroupId: string | undefined
    workspaceWorker: boolean | undefined
    flow?: { id: string, versionId: string, workspaceId: string }
}

export type PrewarmDataResponse = {
    flows: { id: string, versionId: string, workspaceId: string }[]
    platformId: string
    engineToken: string
}

export type ApiToWorkerContract = {
    flowPublished(input: { flowId: string, flowVersionId: string, workspaceId: string }): void
}
