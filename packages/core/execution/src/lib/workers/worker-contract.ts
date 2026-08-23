import { StreamStepProgress } from '../engine/engine-operation'
import { GetWorkflowVersionForWorkerRequest, UploadRunLogsRequest } from '../engine/requests'
import { Execution, RunEnvironment } from '../execution/execution'
import { WorkflowVersion } from '../workflows/workflow-version'
import { TriggerRunStatus } from '../workflows/triggers/trigger-run'
import { ConsumeJobRequest, ConsumeJobResponse, WorkerMachineHealthcheckRequest } from './index'

export type SubmitPayloadsRequest = {
    workflowVersionId: string
    workspaceId: string
    payloads: unknown[]
    httpRequestId?: string
    environment: RunEnvironment
    streamStepProgress: StreamStepProgress
    parentRunId?: string
    failParentOnFailure?: boolean
}

export type SavePayloadRequest = {
    workflowId: string
    workflowVersionId: string
    workspaceId: string
    payloads: unknown[]
}

export type GetConnectorRequest = {
    name: string
    version?: string
    workspaceId?: string
    tenantId?: string
}

export type GetWorkflowBundleRequest = {
    workflowVersionId: string
    workspaceId: string
}

export type GetWorkflowBundleResponse =
    | { kind: 'inline', data: Buffer }
    | { kind: 'url', url: string }

export type PrepareWorkflowBundleUploadRequest = {
    workflowVersionId: string
    workspaceId: string
    tenantId: string
    size: number
}

export type PrepareWorkflowBundleUploadResponse =
    | { kind: 'url', url: string }
    | { kind: 'inline' }
    | { kind: 'skip' }

export type UploadWorkflowBundleRequest = {
    workflowVersionId: string
    workspaceId: string
    tenantId: string
    data: Buffer
}

export type RecordTriggerRunRequest = {
    tenantId: string
    connectorName: string
    status: TriggerRunStatus
}

export type WorkerToApiContract = {
    poll(input: WorkerMachineHealthcheckRequest): Promise<ConsumeJobRequest | null>
    completeJob(input: ConsumeJobResponse & { jobId: string, token: string, queueName: string }): Promise<void>
    uploadRunLog(input: UploadRunLogsRequest): Promise<void>
    submitPayloads(input: SubmitPayloadsRequest): Promise<Execution[]>
    savePayloads(input: SavePayloadRequest): Promise<void>
    getWorkflowVersion(input: GetWorkflowVersionForWorkerRequest): Promise<WorkflowVersion | null>
    getConnector(input: GetConnectorRequest): Promise<unknown>
    getPrewarmData(input: PrewarmDataRequest): Promise<PrewarmDataResponse>
    getConnectorArchive(input: { archiveId: string }): Promise<Buffer>
    getWorkflowBundle(input: GetWorkflowBundleRequest): Promise<GetWorkflowBundleResponse | null>
    prepareWorkflowBundleUpload(input: PrepareWorkflowBundleUploadRequest): Promise<PrepareWorkflowBundleUploadResponse>
    uploadWorkflowBundle(input: UploadWorkflowBundleRequest): Promise<void>
    recordTriggerRun(input: RecordTriggerRunRequest): Promise<void>
    extendLock(input: { jobId: string, token: string, queueName: string }): Promise<void>
    disableWorkflow(input: DisableWorkflowRequest): Promise<void>
}

export type DisableWorkflowRequest = {
    workflowId: string
    workspaceId: string
}

export type PrewarmDataRequest = {
    workerGroupId: string | undefined
    workspaceWorker: boolean | undefined
    workflow?: { id: string, versionId: string, workspaceId: string }
}

export type PrewarmDataResponse = {
    workflows: { id: string, versionId: string, workspaceId: string }[]
    tenantId: string
    engineToken: string
}

export type ApiToWorkerContract = {
    workflowPublished(input: { workflowId: string, workflowVersionId: string, workspaceId: string }): void
}
