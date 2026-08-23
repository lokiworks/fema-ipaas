import { ApId } from '@fema/core-utils'
import { ExecutionStatus } from '@fema/workflow-core'
import { z } from 'zod'

export const TenantMetricsReportRequest = z.object({
    createdAfter: z.string(),
    createdBefore: z.string(),
})

export const TenantMetricsSummary = z.object({
    completed: z.number(),
    successRate: z.number(),
    previousCompleted: z.number(),
    previousSuccessRate: z.number(),
})

export const TenantMetricsStatusPoint = z.object({
    day: z.string(),
    status: z.enum(ExecutionStatus),
    count: z.number(),
})

export const InternalErrorImpactItem = z.object({
    workspaceId: ApId,
    workspaceName: z.string(),
    workflowId: ApId,
    workflowName: z.string(),
    count: z.number(),
})

export const TenantMetricsReport = z.object({
    summary: TenantMetricsSummary,
    statusTimeseries: z.array(TenantMetricsStatusPoint),
    internalErrors: z.array(InternalErrorImpactItem),
    nextRefreshAt: z.string(),
})

export const StuckJob = z.object({
    executionId: ApId,
    workflowId: ApId,
    workflowName: z.string(),
    workspaceId: ApId,
    workspaceName: z.string(),
    status: z.enum(ExecutionStatus),
})

export const TenantMetricsLive = z.object({
    running: z.number(),
    queued: z.number(),
    stuckJobs: z.array(StuckJob),
})

export const TenantMetricsHealthDay = z.object({
    day: z.string(),
    internalErrors: z.number(),
    affectedWorkflows: z.number(),
    stuckJobs: z.number(),
})

export const TenantMetricsHealthHistory = z.object({
    days: z.array(TenantMetricsHealthDay),
})

export type TenantMetricsReportRequest = z.infer<typeof TenantMetricsReportRequest>
export type TenantMetricsSummary = z.infer<typeof TenantMetricsSummary>
export type TenantMetricsStatusPoint = z.infer<typeof TenantMetricsStatusPoint>
export type InternalErrorImpactItem = z.infer<typeof InternalErrorImpactItem>
export type TenantMetricsReport = z.infer<typeof TenantMetricsReport>
export type StuckJob = z.infer<typeof StuckJob>
export type TenantMetricsLive = z.infer<typeof TenantMetricsLive>
export type TenantMetricsHealthDay = z.infer<typeof TenantMetricsHealthDay>
export type TenantMetricsHealthHistory = z.infer<typeof TenantMetricsHealthHistory>
