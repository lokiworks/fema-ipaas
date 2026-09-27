import { isNil } from '@fema-ipaas/core-utils'
import {
    ExecutionStatus,
    FAILED_STATES,
    HOME_HOURS_PER_DAY,
    HomeProjectRunCount,
    HomeTodo,
    isExecutionStateTerminal,
} from '@fema-ipaas/shared'

function resolveSince({ since, now }: { since: string, now: Date }): Date {
    const parsed = new Date(since)
    const earliest = now.getTime() - MAX_LOOKBACK_MS
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() > now.getTime() || parsed.getTime() < earliest) {
        return new Date(now.getTime() - DEFAULT_LOOKBACK_MS)
    }
    return parsed
}

function summarizeStatusCounts(rows: StatusCountRow[]): RunTotals {
    return rows.reduce<RunTotals>((totals, row) => ({
        total: totals.total + row.count,
        succeeded: totals.succeeded + (row.status === ExecutionStatus.SUCCEEDED ? row.count : 0),
        failedOrTimeout: totals.failedOrTimeout + (isFailedOrTimeout(row.status) ? row.count : 0),
        finished: totals.finished + (isExecutionStateTerminal({ status: row.status, ignoreInternalError: false }) ? row.count : 0),
    }), { total: 0, succeeded: 0, failedOrTimeout: 0, finished: 0 })
}

function summarizeByProject(rows: ProjectStatusCountRow[]): HomeProjectRunCount[] {
    const projectIds = [...new Set(rows.map((row) => row.projectId))]
    return projectIds
        .map((projectId) => {
            const totals = summarizeStatusCounts(rows.filter((row) => row.projectId === projectId))
            return { projectId, total: totals.total, failedOrTimeout: totals.failedOrTimeout }
        })
        .sort((a, b) => b.total - a.total || b.failedOrTimeout - a.failedOrTimeout)
}

function fillHourly(rows: HourlyBucketRow[]): number[] {
    return Array.from({ length: HOME_HOURS_PER_DAY }, (_, hour) =>
        rows.filter((row) => row.bucket === hour).reduce((sum, row) => sum + row.count, 0),
    )
}

function isFailedOrTimeout(status: ExecutionStatus): boolean {
    return FAILED_STATES.includes(status)
}

function canDecideRelease({ approverIds, requestedById, userId }: { approverIds: string[], requestedById: string, userId: string }): boolean {
    if (!approverIds.includes(userId)) {
        return false
    }
    const otherApprovers = approverIds.filter((approver) => approver !== requestedById)
    return requestedById !== userId || otherApprovers.length === 0
}

function latestTodos({ todos, limit }: { todos: HomeTodo[], limit: number }): HomeTodo[] {
    return [...todos].sort((a, b) => b.created.localeCompare(a.created)).slice(0, limit)
}

function countAffectedWorkflows({ usages, externalId, projectIds }: { usages: WorkflowConnectionUsage[], externalId: string, projectIds: string[] }): number {
    const affected = usages.filter((usage) => projectIds.includes(usage.projectId) && usage.connectionIds.includes(externalId))
    return new Set(affected.map((usage) => usage.workflowId)).size
}

function displayName({ firstName, lastName, email }: { firstName: string | null, lastName: string | null, email: string | null }): string | null {
    const full = [firstName, lastName].filter((part): part is string => !isNil(part) && part.trim().length > 0).join(' ')
    if (full.length > 0) {
        return full
    }
    return isNil(email) ? null : email
}

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000
const MAX_LOOKBACK_MS = 26 * 60 * 60 * 1000

export const homeAggregation = {
    resolveSince,
    summarizeStatusCounts,
    summarizeByProject,
    fillHourly,
    isFailedOrTimeout,
    canDecideRelease,
    latestTodos,
    countAffectedWorkflows,
    displayName,
}

export type StatusCountRow = {
    status: ExecutionStatus
    count: number
}

export type ProjectStatusCountRow = StatusCountRow & {
    projectId: string
}

export type HourlyBucketRow = {
    bucket: number
    count: number
}

export type WorkflowConnectionUsage = {
    workflowId: string
    projectId: string
    connectionIds: string[]
}

export type RunTotals = {
    total: number
    succeeded: number
    failedOrTimeout: number
    finished: number
}
