import { Nullable, OptionalArrayFromQuery } from '@fema-ipaas/core-utils'
import { ExecutionStatus, FailedStep, RunEnvironment, WorkflowRetryStrategy } from '@fema-ipaas/workflow-core'
import { z } from 'zod'

export enum RunLogType {
    RUN = 'RUN',
    DEBUG = 'DEBUG',
    ALL = 'ALL',
}

export enum RunLogMatch {
    ALL = 'ALL',
    ANY = 'ANY',
}

export enum RunLogTimeRange {
    MINUTES_15 = '15m',
    MINUTES_30 = '30m',
    HOURS_1 = '1h',
    HOURS_24 = '24h',
    DAYS_3 = '3d',
    DAYS_7 = '7d',
    DAYS_15 = '15d',
    DAYS_30 = '30d',
}

export enum RunLogDurationOperator {
    GTE = 'GTE',
    LTE = 'LTE',
}

export enum RunLogConditionField {
    PROJECT = 'project',
    WORKFLOW = 'workflow',
    STATUS = 'status',
    CONNECTOR = 'connector',
    CONTENT = 'content',
    BUSINESS_KEY = 'businessKey',
    DURATION = 'duration',
}

export enum RunLogConditionState {
    COMPLETE = 'COMPLETE',
    EMPTY = 'EMPTY',
    INVALID = 'INVALID',
}

export enum RunRerunBlockReason {
    DEBUG_RUN = 'DEBUG_RUN',
    DEDUPED = 'DEDUPED',
    WORKFLOW_DELETED = 'WORKFLOW_DELETED',
    SUBFLOW_RUN = 'SUBFLOW_RUN',
    RERUN_SUCCEEDED = 'RERUN_SUCCEEDED',
    RERUN_IN_PROGRESS = 'RERUN_IN_PROGRESS',
    NOT_FAILED = 'NOT_FAILED',
    VIEW_ONLY = 'VIEW_ONLY',
    NO_PUBLISHED_VERSION = 'NO_PUBLISHED_VERSION',
    WORKFLOW_STOPPED = 'WORKFLOW_STOPPED',
    NO_FAILED_STEP = 'NO_FAILED_STEP',
    RAW_DATA_EXPIRED = 'RAW_DATA_EXPIRED',
}

export const RunLogCondition = z.discriminatedUnion('field', [
    z.object({ field: z.literal(RunLogConditionField.PROJECT), values: z.array(z.string()) }),
    z.object({ field: z.literal(RunLogConditionField.WORKFLOW), values: z.array(z.string()) }),
    z.object({ field: z.literal(RunLogConditionField.STATUS), values: z.array(z.enum(ExecutionStatus)) }),
    z.object({ field: z.literal(RunLogConditionField.CONNECTOR), values: z.array(z.string()) }),
    z.object({ field: z.literal(RunLogConditionField.CONTENT), text: z.string() }),
    z.object({ field: z.literal(RunLogConditionField.BUSINESS_KEY), text: z.string() }),
    z.object({ field: z.literal(RunLogConditionField.DURATION), operator: z.enum(RunLogDurationOperator), seconds: z.string() }),
])
export type RunLogCondition = z.infer<typeof RunLogCondition>

export const RunLogCustomRange = z.object({
    createdAfter: z.string(),
    createdBefore: z.string().nullable(),
})
export type RunLogCustomRange = z.infer<typeof RunLogCustomRange>

export const RunLogFilterState = z.object({
    type: z.enum(RunLogType),
    match: z.enum(RunLogMatch),
    time: z.enum(RunLogTimeRange),
    customRange: RunLogCustomRange.nullable(),
    conditions: z.array(RunLogCondition),
    runIds: z.array(z.string()),
})
export type RunLogFilterState = z.infer<typeof RunLogFilterState>

export const ListRunLogsRequestQuery = z.object({
    type: z.enum(RunLogType).optional(),
    match: z.enum(RunLogMatch).optional(),
    time: z.enum(RunLogTimeRange).optional(),
    timezone: z.string().max(64).optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
    projectId: OptionalArrayFromQuery(z.string()),
    workflowId: OptionalArrayFromQuery(z.string()),
    status: OptionalArrayFromQuery(z.enum(ExecutionStatus)),
    connector: OptionalArrayFromQuery(z.string()),
    content: z.string().max(200).optional(),
    businessKey: z.string().max(200).optional(),
    durationOperator: z.enum(RunLogDurationOperator).optional(),
    durationSeconds: z.coerce.number().min(0).optional(),
    runIds: OptionalArrayFromQuery(z.string()),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
})
export type ListRunLogsRequestQuery = z.infer<typeof ListRunLogsRequestQuery>

export const RunLogRow = z.object({
    id: z.string(),
    created: z.string(),
    startTime: Nullable(z.string()),
    finishTime: Nullable(z.string()),
    projectId: z.string(),
    projectDisplayName: z.string(),
    workflowId: z.string(),
    workflowDisplayName: Nullable(z.string()),
    workflowExists: z.boolean(),
    workflowVersionId: z.string(),
    versionNumber: Nullable(z.number()),
    environment: z.enum(RunEnvironment),
    type: z.enum(RunLogType),
    status: z.enum(ExecutionStatus),
    durationMs: Nullable(z.number()),
    errorCount: z.number(),
    failedStep: FailedStep.optional(),
    parentRunId: Nullable(z.string()),
    triggeredBy: Nullable(z.string()),
    issueId: Nullable(z.string()),
    rerunOfExecutionId: Nullable(z.string()),
    businessKey: Nullable(z.string()),
    inPlaceRetryCount: z.number(),
    rerunCount: z.number(),
    latestRerunId: Nullable(z.string()),
    rerunBlockReason: Nullable(z.enum(RunRerunBlockReason)),
    fromFailedStepBlockReason: Nullable(z.enum(RunRerunBlockReason)),
})
export type RunLogRow = z.infer<typeof RunLogRow>

export const RunLogScopeProject = z.object({
    id: z.string(),
    displayName: z.string(),
    retentionDays: z.number(),
    canRerun: z.boolean(),
})
export type RunLogScopeProject = z.infer<typeof RunLogScopeProject>

export const RunLogScopeWorkflow = z.object({
    id: z.string(),
    projectId: z.string(),
    displayName: z.string(),
})
export type RunLogScopeWorkflow = z.infer<typeof RunLogScopeWorkflow>

export const RunLogScope = z.object({
    projects: z.array(RunLogScopeProject),
    workflows: z.array(RunLogScopeWorkflow),
    connectors: z.array(z.string()),
    tenantRetentionDays: z.number(),
    canManagePrivacy: z.boolean(),
})
export type RunLogScope = z.infer<typeof RunLogScope>

export const RunLogIssueSummary = z.object({
    id: z.string(),
    title: z.string(),
    errorCode: Nullable(z.string()),
    occurrences: z.number(),
    assigneeId: Nullable(z.string()),
})
export type RunLogIssueSummary = z.infer<typeof RunLogIssueSummary>

export const RunLogConnectionSummary = z.object({
    externalId: z.string(),
    displayName: Nullable(z.string()),
    status: Nullable(z.string()),
})
export type RunLogConnectionSummary = z.infer<typeof RunLogConnectionSummary>

export const RunLogRerunSummary = z.object({
    id: z.string(),
    status: z.enum(ExecutionStatus),
    created: z.string(),
})
export type RunLogRerunSummary = z.infer<typeof RunLogRerunSummary>

export const RunLogDetail = z.object({
    row: RunLogRow,
    issue: RunLogIssueSummary.nullable(),
    connection: RunLogConnectionSummary.nullable(),
    dedupeKey: Nullable(z.string()),
    reruns: z.array(RunLogRerunSummary),
    cancellableChildRuns: z.number(),
    canTerminate: z.boolean(),
})
export type RunLogDetail = z.infer<typeof RunLogDetail>

export const RerunRunLogsRequestBody = z.object({
    executionIds: z.array(z.string()).min(1).max(100),
    strategy: z.enum(WorkflowRetryStrategy),
})
export type RerunRunLogsRequestBody = z.infer<typeof RerunRunLogsRequestBody>

export const RerunRunLogResult = z.object({
    executionId: z.string(),
    rerunExecutionId: Nullable(z.string()),
    blockReason: Nullable(z.enum(RunRerunBlockReason)),
    error: Nullable(z.string()),
})
export type RerunRunLogResult = z.infer<typeof RerunRunLogResult>

export const RerunRunLogsResponse = z.object({
    results: z.array(RerunRunLogResult),
})
export type RerunRunLogsResponse = z.infer<typeof RerunRunLogsResponse>

export const TerminateRunLogRequestBody = z.object({
    stopChildRuns: z.boolean(),
})
export type TerminateRunLogRequestBody = z.infer<typeof TerminateRunLogRequestBody>
