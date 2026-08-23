import { z } from 'zod'
import { OptionalArrayFromQuery, OptionalBooleanFromQuery } from '@fema-ipaas/core-utils'
import { ApId } from '@fema-ipaas/core-utils'
import { ExecutionStatus } from '../state/workflow-execution'

export const ListExecutionsRequestQuery = z.object({
    workflowId: OptionalArrayFromQuery(ApId),
    tags: OptionalArrayFromQuery(z.string()),
    status: OptionalArrayFromQuery(z.nativeEnum(ExecutionStatus)),
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
    workspaceId: ApId,
    failedStepName: z.string().optional(),
    failedStepMessage: z.string().optional(),
    executionIds: OptionalArrayFromQuery(ApId),
    includeArchived: OptionalBooleanFromQuery,
})

export type ListExecutionsRequestQuery = z.infer<typeof ListExecutionsRequestQuery>

export const CountExecutionsByStatusRequest = z.object({
    workspaceId: ApId,
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
})

export const ExecutionCountByStatus = z.object({
    status: z.nativeEnum(ExecutionStatus),
    count: z.number(),
})

export const CountExecutionsByStatusResponse = z.object({
    data: z.array(ExecutionCountByStatus),
})

export type CountExecutionsByStatusRequest = z.infer<typeof CountExecutionsByStatusRequest>
export type ExecutionCountByStatus = z.infer<typeof ExecutionCountByStatus>
export type CountExecutionsByStatusResponse = z.infer<typeof CountExecutionsByStatusResponse>

export const WorkspaceOverviewRequest = z.object({
    workspaceId: ApId,
    days: z.coerce.number().min(1).max(90).default(7),
})

export const ExecutionDailyTrend = z.object({
    day: z.string(),
    status: z.nativeEnum(ExecutionStatus),
    count: z.number(),
})

export const FailingWorkflowSummary = z.object({
    workflowId: z.string(),
    displayName: z.string(),
    count: z.number(),
    lastFailure: z.string(),
})

export const WorkspaceOverviewResponse = z.object({
    countByStatus: z.array(ExecutionCountByStatus),
    dailyTrend: z.array(ExecutionDailyTrend),
    topFailingWorkflows: z.array(FailingWorkflowSummary),
})

export type WorkspaceOverviewRequest = z.infer<typeof WorkspaceOverviewRequest>
export type ExecutionDailyTrend = z.infer<typeof ExecutionDailyTrend>
export type FailingWorkflowSummary = z.infer<typeof FailingWorkflowSummary>
export type WorkspaceOverviewResponse = z.infer<typeof WorkspaceOverviewResponse>
