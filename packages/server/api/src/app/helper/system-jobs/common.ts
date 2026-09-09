import { ExecutionId, ProjectId, TenantId, WorkflowId } from '@fema-ipaas/core-utils'
import { Workflow } from '@fema-ipaas/shared'
import { Job, JobsOptions } from 'bullmq'
import { Dayjs } from 'dayjs'

export enum SystemJobName {
    CONNECTORS_ANALYTICS = 'connectors-analytics',
    CONNECTORS_SYNC = 'connectors-sync',
    FILE_CLEANUP_TRIGGER = 'file-cleanup-trigger',
    RUN_TELEMETRY = 'run-telemetry',
    DELETE_WORKFLOW = 'delete-workflow',
    HARD_DELETE_PROJECT = 'hard-delete-project',
    HARD_DELETE_TENANT = 'hard-delete-tenant',
    RESUME_DELAY_WAITPOINT = 'resume-delay-waitpoint',
    TOOL_SEARCH_REINDEX = 'tool-search-reindex',
    CHAT_STALE_SWEEP = 'chat-stale-sweep',
}

type DeleteWorkflowDurableSystemJobData =  {
    workflow: Workflow
    preDeleteDone: boolean
}

type HardDeleteProjectSystemJobData = {
    projectId: ProjectId
    tenantId: TenantId
    preDeletedWorkflowIds: WorkflowId[]
}

type HardDeleteTenantSystemJobData = {
    tenantId: TenantId
}

type ResumeDelayWaitpointSystemJobData = {
    executionId: ExecutionId
    projectId: ProjectId
    waitpointId: string
}

// Scope shape kept inline (structurally equal to tool-search's ReindexScope) so this generic
// job framework does not depend on the tool-search feature module.
type ToolSearchReindexSystemJobData = {
    scope: { type: 'all' } | { type: 'tenant', tenantId: TenantId }
}

type SystemJobDataMap = {
    [SystemJobName.CONNECTORS_ANALYTICS]: Record<string, never>
    [SystemJobName.CONNECTORS_SYNC]: Record<string, never>
    [SystemJobName.FILE_CLEANUP_TRIGGER]: Record<string, never>
    [SystemJobName.RUN_TELEMETRY]: Record<string, never>
    [SystemJobName.DELETE_WORKFLOW]: DeleteWorkflowDurableSystemJobData
    [SystemJobName.HARD_DELETE_PROJECT]: HardDeleteProjectSystemJobData
    [SystemJobName.HARD_DELETE_TENANT]: HardDeleteTenantSystemJobData
    [SystemJobName.RESUME_DELAY_WAITPOINT]: ResumeDelayWaitpointSystemJobData
    [SystemJobName.TOOL_SEARCH_REINDEX]: ToolSearchReindexSystemJobData
    [SystemJobName.CHAT_STALE_SWEEP]: Record<string, never>
}

export type SystemJobData<T extends SystemJobName = SystemJobName> = T extends SystemJobName ? SystemJobDataMap[T] : never

export type SystemJobDefinition<T extends SystemJobName> = {
    name: T
    data: SystemJobData<T>
    jobId: string
}

export type SystemJobHandler<T extends SystemJobName = SystemJobName> = (data: SystemJobData<T>) => Promise<void>

type OneTimeJobSchedule = {
    type: 'one-time'
    date: Dayjs
}

type RepeatedJobSchedule = {
    type: 'repeated'
    cron: string
}

export type JobSchedule = OneTimeJobSchedule | RepeatedJobSchedule

type UpsertJobParams<T extends SystemJobName> = {
    job: SystemJobDefinition<T>
    schedule: JobSchedule
    customConfig?: JobsOptions
}

export type SystemJobSchedule = {
    init(): Promise<void>
    startWorker(): Promise<void>
    upsertJob<T extends SystemJobName>(params: UpsertJobParams<T>): Promise<void>
    getJob<T extends SystemJobName>(jobId: string): Promise<Job<SystemJobData<T>> | undefined>
    close(): Promise<void>
}
