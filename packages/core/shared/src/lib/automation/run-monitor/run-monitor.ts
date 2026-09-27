import { BaseModelSchema, EntityId, LlmProvider, Nullable, OptionalArrayFromQuery } from '@fema-ipaas/core-utils'
import { ExecutionStatus, WorkflowStatus } from '@fema-ipaas/workflow-core'
import { z } from 'zod'
import { formErrors } from '../../form-errors'

export enum RunMonitorRange {
    LAST_15_MINUTES = '15m',
    LAST_HOUR = '1h',
    LAST_24_HOURS = '24h',
    LAST_7_DAYS = '7d',
    LAST_30_DAYS = '30d',
}

export enum RunMonitorBucketUnit {
    MINUTE = 'MINUTE',
    HOUR = 'HOUR',
    DAY = 'DAY',
}

export enum RunMonitorStatusGroup {
    SUCCEEDED = 'SUCCEEDED',
    FAILED = 'FAILED',
    TERMINATED = 'TERMINATED',
    RUNNING = 'RUNNING',
}

export enum RunMonitorMetric {
    ALL = 'ALL',
    SUCCEEDED = 'SUCCEEDED',
    FAILED = 'FAILED',
    TERMINATED = 'TERMINATED',
}

export enum RunMonitorChartMode {
    CHART = 'CHART',
    TABLE = 'TABLE',
}

export enum RunMonitorAiSource {
    WORKFLOW_RUN = 'WORKFLOW_RUN',
    DEBUG_RUN = 'DEBUG_RUN',
    EDITOR_ASSISTANT = 'EDITOR_ASSISTANT',
    AUTO_MAPPING = 'AUTO_MAPPING',
    GENERATE_WORKFLOW = 'GENERATE_WORKFLOW',
}

export const RUN_MONITOR_VIEW_NAME_MAX_LENGTH = 20
export const RUN_MONITOR_MAX_VIEWS_PER_USER = 50
export const RUN_MONITOR_MAX_FILTER_IDS = 200
export const RUN_MONITOR_MAX_WORKFLOW_ROWS = 500

export const RunMonitorQuery = z.object({
    range: z.enum(RunMonitorRange).default(RunMonitorRange.LAST_7_DAYS),
    timezone: z.string().max(64).optional(),
    projectIds: OptionalArrayFromQuery(EntityId),
    workflowIds: OptionalArrayFromQuery(EntityId),
})
export type RunMonitorQuery = z.infer<typeof RunMonitorQuery>

export const RunMonitorStats = z.object({
    runs: z.number(),
    previousRuns: z.number(),
    succeeded: z.number(),
    failed: z.number(),
    terminated: z.number(),
    running: z.number(),
    finished: z.number(),
    enabledWorkflows: z.number(),
    workflowsInScope: z.number(),
    activeWorkflows: z.number(),
    executedSteps: z.number(),
    peakConcurrency: z.number(),
    peakAt: Nullable(z.string()),
})
export type RunMonitorStats = z.infer<typeof RunMonitorStats>

export const RunMonitorBucket = z.object({
    start: z.string(),
    end: z.string(),
    succeeded: z.number(),
    failed: z.number(),
    terminated: z.number(),
    running: z.number(),
})
export type RunMonitorBucket = z.infer<typeof RunMonitorBucket>

export const RunMonitorStatusCount = z.object({
    status: z.enum(ExecutionStatus),
    count: z.number(),
})
export type RunMonitorStatusCount = z.infer<typeof RunMonitorStatusCount>

export const RunMonitorWorkflowRow = z.object({
    workflowId: z.string(),
    workflowDisplayName: z.string(),
    projectId: z.string(),
    projectDisplayName: z.string(),
    runs: z.number(),
    succeeded: z.number(),
    failed: z.number(),
    terminated: z.number(),
    running: z.number(),
    avgDurationMs: Nullable(z.number()),
    p95DurationMs: Nullable(z.number()),
    lastRunAt: z.string(),
    trend: z.array(z.number()),
})
export type RunMonitorWorkflowRow = z.infer<typeof RunMonitorWorkflowRow>

export const RunMonitorSummary = z.object({
    range: z.enum(RunMonitorRange),
    timezone: z.string(),
    unit: z.enum(RunMonitorBucketUnit),
    step: z.number(),
    from: z.string(),
    to: z.string(),
    previousFrom: z.string(),
    stats: RunMonitorStats,
    buckets: z.array(RunMonitorBucket),
    byStatus: z.array(RunMonitorStatusCount),
    workflows: z.array(RunMonitorWorkflowRow),
    workflowsTruncated: z.boolean(),
})
export type RunMonitorSummary = z.infer<typeof RunMonitorSummary>

export const RunMonitorProjectOption = z.object({
    id: z.string(),
    displayName: z.string(),
})
export type RunMonitorProjectOption = z.infer<typeof RunMonitorProjectOption>

export const RunMonitorWorkflowOption = z.object({
    id: z.string(),
    projectId: z.string(),
    displayName: z.string(),
    status: z.enum(WorkflowStatus),
})
export type RunMonitorWorkflowOption = z.infer<typeof RunMonitorWorkflowOption>

export const RunMonitorOptions = z.object({
    projects: z.array(RunMonitorProjectOption),
    workflows: z.array(RunMonitorWorkflowOption),
})
export type RunMonitorOptions = z.infer<typeof RunMonitorOptions>

const AiTotals = z.object({
    calls: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
})

export const RunMonitorAiUsage = z.object({
    totals: AiTotals,
    runs: z.number(),
    runsWithAi: z.number(),
    byModel: z.array(AiTotals.extend({ provider: z.enum(LlmProvider), model: z.string() })),
    bySource: z.array(AiTotals.extend({ source: z.enum(RunMonitorAiSource) })),
    byWorkflow: z.array(AiTotals.extend({
        workflowId: z.string(),
        workflowDisplayName: z.string(),
        projectId: z.string(),
        projectDisplayName: z.string(),
        models: z.array(z.string()),
        runs: z.number(),
    })),
})
export type RunMonitorAiUsage = z.infer<typeof RunMonitorAiUsage>

export const RunMonitorViewConfig = z.object({
    range: z.enum(RunMonitorRange),
    projectIds: z.array(z.string()).max(RUN_MONITOR_MAX_FILTER_IDS),
    workflowIds: z.array(z.string()).max(RUN_MONITOR_MAX_FILTER_IDS),
    metric: z.enum(RunMonitorMetric),
    chartMode: z.enum(RunMonitorChartMode),
})
export type RunMonitorViewConfig = z.infer<typeof RunMonitorViewConfig>

export const RunMonitorView = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    userId: z.string(),
    name: z.string(),
    config: RunMonitorViewConfig,
})
export type RunMonitorView = z.infer<typeof RunMonitorView>

export const RunMonitorViewName = z.string().trim().min(1, formErrors.required).max(RUN_MONITOR_VIEW_NAME_MAX_LENGTH, 'runMonitorViewNameTooLong')

export const CreateRunMonitorViewRequestBody = z.object({
    name: RunMonitorViewName,
    config: RunMonitorViewConfig,
})
export type CreateRunMonitorViewRequestBody = z.infer<typeof CreateRunMonitorViewRequestBody>

export const UpdateRunMonitorViewRequestBody = z.object({
    name: RunMonitorViewName.optional(),
    config: RunMonitorViewConfig.optional(),
})
export type UpdateRunMonitorViewRequestBody = z.infer<typeof UpdateRunMonitorViewRequestBody>

export const DEFAULT_RUN_MONITOR_VIEW_CONFIG: RunMonitorViewConfig = {
    range: RunMonitorRange.LAST_7_DAYS,
    projectIds: [],
    workflowIds: [],
    metric: RunMonitorMetric.ALL,
    chartMode: RunMonitorChartMode.CHART,
}
