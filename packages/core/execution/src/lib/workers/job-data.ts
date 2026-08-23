
import { z } from 'zod'
import { isNil } from '@fema/core-utils'
import { ResumeReason, StreamStepProgress, TriggerHookType, TriggerPayload } from '../engine'
import { ExecutionType } from '../execution/state/execution-output'
import { RunEnvironment } from '../execution/execution'
import { CodeActionSchema, ConnectorActionSchema } from '../flows/actions/action'
import { FlowVersion } from '../flows/flow-version'
import { FlowTriggerType } from '../flows/triggers/trigger'
import { ConnectionType, ConnectionValue, ConnectorPackage } from '@fema/connector-types'

export const LATEST_JOB_DATA_SCHEMA_VERSION = 10

export const InlineJobPayload = z.object({
    type: z.literal('inline'),
    value: z.any(),
})

export const RefJobPayload = z.object({
    type: z.literal('ref'),
    fileId: z.string(),
})

export const JobPayload = z.discriminatedUnion('type', [InlineJobPayload, RefJobPayload])


export const JOB_PRIORITY = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
    veryLow: 5,
    lowest: 6,
}

const TESTING_EXECUTE_FLOW_PRIORITY: keyof typeof JOB_PRIORITY = 'high'
const ASYNC_EXECUTE_FLOW_PRIORITY: keyof typeof JOB_PRIORITY = 'medium'
const SYNC_EXECUTE_FLOW_PRIORITY: keyof typeof JOB_PRIORITY = 'high'
export const RATE_LIMIT_PRIORITY: keyof typeof JOB_PRIORITY = 'lowest'

function getExecuteFlowPriority(environment: RunEnvironment, workerHandlerId: string | undefined | null): keyof typeof JOB_PRIORITY {
    switch (environment) {
        case RunEnvironment.TESTING:
            return TESTING_EXECUTE_FLOW_PRIORITY
        case RunEnvironment.PRODUCTION:
            return isNil(workerHandlerId) ? ASYNC_EXECUTE_FLOW_PRIORITY : SYNC_EXECUTE_FLOW_PRIORITY
    }
}

export function getDefaultJobPriority(job: JobData): keyof typeof JOB_PRIORITY {
    switch (job.jobType) {
        case WorkerJobType.EXECUTE_POLLING:
        case WorkerJobType.RENEW_WEBHOOK:
            return 'veryLow'
        case WorkerJobType.EXECUTE_WEBHOOK:
            return 'medium'
        case WorkerJobType.EXECUTE_FLOW:
            return getExecuteFlowPriority(job.environment, job.workerHandlerId)
        case WorkerJobType.EXECUTE_PROPERTY:
        case WorkerJobType.EXECUTE_EXTRACT_CONNECTOR_INFORMATION:
        case WorkerJobType.EXECUTE_VALIDATION:
        case WorkerJobType.EXECUTE_RESOLVE_CONNECTION_IDENTIFIER:
        case WorkerJobType.EXECUTE_TRIGGER_HOOK:
        case WorkerJobType.EXECUTE_TOKEN_REFRESH:
            return 'critical'
        case WorkerJobType.EXECUTE_ACTION:
            return 'high'
    }
}


export enum WorkerJobType {
    RENEW_WEBHOOK = 'RENEW_WEBHOOK',
    EXECUTE_POLLING = 'EXECUTE_POLLING',
    EXECUTE_WEBHOOK = 'EXECUTE_WEBHOOK',
    EXECUTE_FLOW = 'EXECUTE_FLOW',
    EXECUTE_VALIDATION = 'EXECUTE_VALIDATION',
    EXECUTE_RESOLVE_CONNECTION_IDENTIFIER = 'EXECUTE_RESOLVE_CONNECTION_IDENTIFIER',
    EXECUTE_TRIGGER_HOOK = 'EXECUTE_TRIGGER_HOOK',
    EXECUTE_PROPERTY = 'EXECUTE_PROPERTY',
    EXECUTE_EXTRACT_CONNECTOR_INFORMATION = 'EXECUTE_EXTRACT_CONNECTOR_INFORMATION',
    EXECUTE_TOKEN_REFRESH = 'EXECUTE_TOKEN_REFRESH',
    EXECUTE_ACTION = 'EXECUTE_ACTION',
}

export const NON_SCHEDULED_JOB_TYPES: WorkerJobType[] = [
    WorkerJobType.EXECUTE_WEBHOOK,
    WorkerJobType.EXECUTE_FLOW,
    WorkerJobType.EXECUTE_VALIDATION,
    WorkerJobType.EXECUTE_TRIGGER_HOOK,
    WorkerJobType.EXECUTE_PROPERTY,
    WorkerJobType.EXECUTE_EXTRACT_CONNECTOR_INFORMATION,
    WorkerJobType.EXECUTE_TOKEN_REFRESH,
    WorkerJobType.EXECUTE_RESOLVE_CONNECTION_IDENTIFIER,
    WorkerJobType.EXECUTE_ACTION,
] as const

// Never change without increasing LATEST_JOB_DATA_SCHEMA_VERSION, and adding a migration
export const RenewWebhookJobData = z.object({
    schemaVersion: z.number(),
    workspaceId: z.string(),
    platformId: z.string(),
    flowVersionId: z.string(),
    flowId: z.string(),
    jobType: z.literal(WorkerJobType.RENEW_WEBHOOK),
})
export type RenewWebhookJobData = z.infer<typeof RenewWebhookJobData>

// Never change without increasing LATEST_JOB_DATA_SCHEMA_VERSION, and adding a migration
export const PollingJobData = z.object({
    workspaceId: z.string(),
    platformId: z.string(),
    schemaVersion: z.number(),
    flowVersionId: z.string(),
    flowId: z.string(),
    triggerType: z.nativeEnum(FlowTriggerType),
    jobType: z.literal(WorkerJobType.EXECUTE_POLLING),
})
export type PollingJobData = z.infer<typeof PollingJobData>

const ExecuteFlowJobDataCommon = z.object({
    workspaceId: z.string(),
    platformId: z.string(),
    jobType: z.literal(WorkerJobType.EXECUTE_FLOW),
    environment: z.nativeEnum(RunEnvironment),
    schemaVersion: z.number(),
    flowId: z.string(),
    flowVersionId: z.string(),
    runId: z.string(),
    workerHandlerId: z.union([z.string(), z.null()]).optional(),
    httpRequestId: z.string().optional(),
    payload: JobPayload,
    streamStepProgress: z.nativeEnum(StreamStepProgress),
    stepNameToTest: z.string().optional(),
    sampleData: z.record(z.string(), z.unknown()).optional(),
    logsFileId: z.string(),
})

export const BeginExecuteFlowJobData = ExecuteFlowJobDataCommon.extend({
    executionType: z.literal(ExecutionType.BEGIN),
    executeTrigger: z.boolean().optional(),
})
export type BeginExecuteFlowJobData = z.infer<typeof BeginExecuteFlowJobData>

export const ResumeExecuteFlowJobData = ExecuteFlowJobDataCommon.extend({
    executionType: z.literal(ExecutionType.RESUME),
    resumeReason: z.nativeEnum(ResumeReason),
})
export type ResumeExecuteFlowJobData = z.infer<typeof ResumeExecuteFlowJobData>

export const ExecuteFlowJobData = z.discriminatedUnion('executionType', [BeginExecuteFlowJobData, ResumeExecuteFlowJobData])
export type ExecuteFlowJobData = z.infer<typeof ExecuteFlowJobData>

export const WebhookJobData = z.object({
    workspaceId: z.string(),
    platformId: z.string(),
    schemaVersion: z.number(),
    requestId: z.string(),
    payload: JobPayload,
    runEnvironment: z.nativeEnum(RunEnvironment),
    flowId: z.string(),
    saveSampleData: z.boolean(),
    flowVersionIdToRun: z.string(),
    execute: z.boolean(),
    jobType: z.literal(WorkerJobType.EXECUTE_WEBHOOK),
    parentRunId: z.string().optional(),
    failParentOnFailure: z.boolean().optional(),
})
export type WebhookJobData = z.infer<typeof WebhookJobData>

export const ExecuteValidateAuthJobData = z.object({
    jobType: z.literal(WorkerJobType.EXECUTE_VALIDATION),
    workspaceId: z.string().optional(),
    platformId: z.string(),
    connector: ConnectorPackage,
    schemaVersion: z.number(),
    connectionValue: z.unknown(),
    requestId: z.string(),
    webserverId: z.string(),
})
export type ExecuteValidateAuthJobData = z.infer<typeof ExecuteValidateAuthJobData>

export const ExecuteResolveConnectionIdentifierJobData = z.object({
    jobType: z.literal(WorkerJobType.EXECUTE_RESOLVE_CONNECTION_IDENTIFIER),
    workspaceId: z.string().optional(),
    platformId: z.string(),
    connector: ConnectorPackage,
    schemaVersion: z.number(),
    connectionValue: z.custom<ConnectionValue>(),
    connectionType: z.enum(ConnectionType),
    requestId: z.string(),
    webserverId: z.string(),
})
export type ExecuteResolveConnectionIdentifierJobData = z.infer<typeof ExecuteResolveConnectionIdentifierJobData>

export const ExecuteTokenRefreshJobData = z.object({
    jobType: z.literal(WorkerJobType.EXECUTE_TOKEN_REFRESH),
    workspaceId: z.string().optional(),
    platformId: z.string(),
    connector: ConnectorPackage,
    schemaVersion: z.number(),
    connectionValue: z.custom<ConnectionValue>(),
    requestId: z.string(),
    webserverId: z.string(),
})
export type ExecuteTokenRefreshJobData = z.infer<typeof ExecuteTokenRefreshJobData>

export const ExecuteTriggerHookJobData = z.object({
    jobType: z.literal(WorkerJobType.EXECUTE_TRIGGER_HOOK),
    platformId: z.string(),
    workspaceId: z.string(),
    schemaVersion: z.number(),
    flowId: z.string(),
    flowVersionId: z.string(),
    test: z.boolean(),
    hookType: z.nativeEnum(TriggerHookType),
    triggerPayload: TriggerPayload.optional(),
    isRepublish: z.boolean().optional(),
    requestId: z.string(),
    webserverId: z.string(),
})
export type ExecuteTriggerHookJobData = z.infer<typeof ExecuteTriggerHookJobData>

export const ExecutePropertyJobData = z.object({
    jobType: z.literal(WorkerJobType.EXECUTE_PROPERTY),
    workspaceId: z.string(),
    platformId: z.string(),
    schemaVersion: z.number(),
    flowVersion: FlowVersion.optional(),
    propertyName: z.string(),
    connector: ConnectorPackage,
    actionOrTriggerName: z.string(),
    input: z.record(z.string(), z.unknown()),
    sampleData: z.record(z.string(), z.unknown()),
    searchValue: z.string().optional(),
    requestId: z.string(),
    webserverId: z.string(),
})
export type ExecutePropertyJobData = z.infer<typeof ExecutePropertyJobData>

export const ExecuteExtractConnectorMetadataJobData = z.object({
    schemaVersion: z.number(),
    jobType: z.literal(WorkerJobType.EXECUTE_EXTRACT_CONNECTOR_INFORMATION),
    workspaceId: z.undefined(),
    platformId: z.string(),
    connector: ConnectorPackage,
    requestId: z.string(),
    webserverId: z.string(),
})
export type ExecuteExtractConnectorMetadataJobData = z.infer<typeof ExecuteExtractConnectorMetadataJobData>

export const ActionRunStep = z.discriminatedUnion('type', [ConnectorActionSchema, CodeActionSchema])
export type ActionRunStep = z.infer<typeof ActionRunStep>

export const ExecuteActionJobData = z.object({
    jobType: z.literal(WorkerJobType.EXECUTE_ACTION),
    workspaceId: z.string(),
    platformId: z.string(),
    schemaVersion: z.number(),
    step: ActionRunStep,
    connector: z.optional(ConnectorPackage),
    expiresAt: z.number(),
    requestId: z.string(),
    webserverId: z.string(),
})
export type ExecuteActionJobData = z.infer<typeof ExecuteActionJobData>

export const UserInteractionJobData = z.union([
    ExecuteValidateAuthJobData,
    ExecuteResolveConnectionIdentifierJobData,
    ExecuteTokenRefreshJobData,
    ExecuteTriggerHookJobData,
    ExecutePropertyJobData,
    ExecuteExtractConnectorMetadataJobData,
    ExecuteActionJobData,
])
export type UserInteractionJobData = z.infer<typeof UserInteractionJobData>

export const UserInteractionJobDataWithoutWatchingInformation = z.union([
    ExecuteValidateAuthJobData.omit({ schemaVersion: true, requestId: true, webserverId: true }),
    ExecuteResolveConnectionIdentifierJobData.omit({ schemaVersion: true, requestId: true, webserverId: true }),
    ExecuteTokenRefreshJobData.omit({ schemaVersion: true, requestId: true, webserverId: true }),
    ExecuteTriggerHookJobData.omit({ schemaVersion: true, requestId: true, webserverId: true }),
    ExecutePropertyJobData.omit({ schemaVersion: true, requestId: true, webserverId: true }),
    ExecuteExtractConnectorMetadataJobData.omit({ schemaVersion: true, requestId: true, webserverId: true }),
    ExecuteActionJobData.omit({ schemaVersion: true, requestId: true, webserverId: true }),
])
export type UserInteractionJobDataWithoutWatchingInformation = z.infer<typeof UserInteractionJobDataWithoutWatchingInformation>

export const JobData = z.union([
    PollingJobData,
    RenewWebhookJobData,
    ExecuteFlowJobData,
    WebhookJobData,
    UserInteractionJobData,
])
export type JobData = z.infer<typeof JobData>
export type JobPayload = z.infer<typeof JobPayload>
