import { ApId } from '@fema/core-utils'
import { ExecutionStatus } from '@fema/workflow-core'
import { z } from 'zod'

export const PlatformMetricsReportRequest = z.object({
    createdAfter: z.string(),
    createdBefore: z.string(),
})

export const PlatformMetricsSummary = z.object({
    completed: z.number(),
    successRate: z.number(),
    previousCompleted: z.number(),
    previousSuccessRate: z.number(),
})

export const PlatformMetricsStatusPoint = z.object({
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

export const PlatformMetricsReport = z.object({
    summary: PlatformMetricsSummary,
    statusTimeseries: z.array(PlatformMetricsStatusPoint),
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

export const PlatformMetricsLive = z.object({
    running: z.number(),
    queued: z.number(),
    stuckJobs: z.array(StuckJob),
})

export const PlatformMetricsHealthDay = z.object({
    day: z.string(),
    internalErrors: z.number(),
    affectedWorkflows: z.number(),
    stuckJobs: z.number(),
})

export const PlatformMetricsHealthHistory = z.object({
    days: z.array(PlatformMetricsHealthDay),
})

export type PlatformMetricsReportRequest = z.infer<typeof PlatformMetricsReportRequest>
export type PlatformMetricsSummary = z.infer<typeof PlatformMetricsSummary>
export type PlatformMetricsStatusPoint = z.infer<typeof PlatformMetricsStatusPoint>
export type InternalErrorImpactItem = z.infer<typeof InternalErrorImpactItem>
export type PlatformMetricsReport = z.infer<typeof PlatformMetricsReport>
export type StuckJob = z.infer<typeof StuckJob>
export type PlatformMetricsLive = z.infer<typeof PlatformMetricsLive>
export type PlatformMetricsHealthDay = z.infer<typeof PlatformMetricsHealthDay>
export type PlatformMetricsHealthHistory = z.infer<typeof PlatformMetricsHealthHistory>
