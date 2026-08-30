import { z } from 'zod'
import { OptionalArrayFromQuery, OptionalBooleanFromQuery } from '@fema-ipaas/core-utils'
import { EntityId } from '@fema-ipaas/core-utils'
import { ExecutionStatus } from '../state/workflow-execution'

export const ListExecutionsRequestQuery = z.object({
    workflowId: OptionalArrayFromQuery(EntityId),
    tags: OptionalArrayFromQuery(z.string()),
    status: OptionalArrayFromQuery(z.nativeEnum(ExecutionStatus)),
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
    projectId: EntityId,
    failedStepName: z.string().optional(),
    failedStepMessage: z.string().optional(),
    executionIds: OptionalArrayFromQuery(EntityId),
    includeArchived: OptionalBooleanFromQuery,
})

export type ListExecutionsRequestQuery = z.infer<typeof ListExecutionsRequestQuery>

export const CountExecutionsByStatusRequest = z.object({
    projectId: EntityId,
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

export const ProjectOverviewRequest = z.object({
    projectId: EntityId,
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

export const ConnectionHealthSummary = z.object({
    status: z.string(),
    count: z.number(),
})

export const ConnectorUsageSummary = z.object({
    connectorName: z.string(),
    count: z.number(),
})

export const RecentlyEditedWorkflow = z.object({
    workflowId: z.string(),
    displayName: z.string(),
    updated: z.string(),
})

export const ProjectOverviewResponse = z.object({
    countByStatus: z.array(ExecutionCountByStatus),
    dailyTrend: z.array(ExecutionDailyTrend),
    topFailingWorkflows: z.array(FailingWorkflowSummary),
    connectionHealth: z.array(ConnectionHealthSummary),
    topConnectors: z.array(ConnectorUsageSummary),
    recentlyEditedWorkflows: z.array(RecentlyEditedWorkflow),
})

export type ProjectOverviewRequest = z.infer<typeof ProjectOverviewRequest>
export type ExecutionDailyTrend = z.infer<typeof ExecutionDailyTrend>
export type FailingWorkflowSummary = z.infer<typeof FailingWorkflowSummary>
export type ConnectionHealthSummary = z.infer<typeof ConnectionHealthSummary>
export type ConnectorUsageSummary = z.infer<typeof ConnectorUsageSummary>
export type RecentlyEditedWorkflow = z.infer<typeof RecentlyEditedWorkflow>
export type ProjectOverviewResponse = z.infer<typeof ProjectOverviewResponse>
