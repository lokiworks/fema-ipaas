import { Nullable } from '@fema-ipaas/core-utils'
import { ExecutionStatus } from '@fema-ipaas/workflow-core'
import { z } from 'zod'
import { ConnectionStatus } from '../../automation/connection/connection'

export const HomeSummaryRequestQuery = z.object({
    since: z.iso.datetime({ offset: true }),
})
export type HomeSummaryRequestQuery = z.infer<typeof HomeSummaryRequestQuery>

export const HomeProjectRunCount = z.object({
    projectId: z.string(),
    total: z.number(),
    failedOrTimeout: z.number(),
})
export type HomeProjectRunCount = z.infer<typeof HomeProjectRunCount>

export const HomeRunStats = z.object({
    since: z.string(),
    total: z.number(),
    succeeded: z.number(),
    failedOrTimeout: z.number(),
    finished: z.number(),
    hourly: z.array(z.number()),
    byProject: z.array(HomeProjectRunCount),
})
export type HomeRunStats = z.infer<typeof HomeRunStats>

export const HomeFailedRun = z.object({
    id: z.string(),
    projectId: z.string(),
    workflowId: z.string(),
    workflowDisplayName: z.string(),
    status: z.enum(ExecutionStatus),
    created: z.string(),
})
export type HomeFailedRun = z.infer<typeof HomeFailedRun>

export const HomeBrokenConnection = z.object({
    id: z.string(),
    displayName: z.string(),
    connectorName: z.string(),
    status: z.enum(ConnectionStatus),
    projectId: z.string(),
    affectedWorkflowCount: z.number(),
})
export type HomeBrokenConnection = z.infer<typeof HomeBrokenConnection>

export enum HomeTodoType {
    RELEASE = 'RELEASE',
    AGENT_APPROVAL = 'AGENT_APPROVAL',
}

export const HomeTodo = z.object({
    type: z.enum(HomeTodoType),
    id: z.string(),
    projectId: z.string(),
    workflowId: z.string(),
    workflowDisplayName: z.string(),
    executionId: Nullable(z.string()),
    requesterName: Nullable(z.string()),
    subject: Nullable(z.string()),
    created: z.string(),
})
export type HomeTodo = z.infer<typeof HomeTodo>

export const HomeSummary = z.object({
    runs: HomeRunStats,
    failedRuns: z.array(HomeFailedRun),
    brokenConnections: z.array(HomeBrokenConnection),
    todos: z.array(HomeTodo),
    todoTotal: z.number(),
})
export type HomeSummary = z.infer<typeof HomeSummary>

export const HOME_TODO_LIMIT = 5
export const HOME_FAILED_RUNS_LIMIT = 3
export const HOME_BROKEN_CONNECTIONS_LIMIT = 5
export const HOME_HOURS_PER_DAY = 24
