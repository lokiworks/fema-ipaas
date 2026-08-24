import { TenantId } from '@fema-ipaas/core-utils'
import { dayjsDuration } from '@fema-ipaas/server-utils'
import { ExecutionStatus, InternalErrorImpactItem, RunEnvironment, StuckJob, TenantMetricsHealthDay, TenantMetricsHealthHistory, TenantMetricsLive, TenantMetricsReport, TenantMetricsStatusPoint } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { distributedStore } from '../database/redis-connections'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { executionRepo } from '../workflows/execution/execution-service'
import { workspaceService } from '../workspace/workspace-service'

type ReportWindow = {
    createdAfter: string
    createdBefore: string
}

function buildReportCacheKey(tenantId: TenantId, window: ReportWindow): string {
    return `${REPORT_CACHE_PREFIX}:${tenantId}:${window.createdAfter}:${window.createdBefore}`
}

async function countsByStatus(workspaceIds: string[], window: ReportWindow): Promise<Map<ExecutionStatus, number>> {
    const rows: Array<{ status: ExecutionStatus, count: string }> = await executionRepo().query(`
        SELECT status, COUNT(*) AS count
        FROM execution
        WHERE "workspaceId" = ANY($1)
          AND environment = $2
          AND "archivedAt" IS NULL
          AND created >= $3
          AND created <= $4
        GROUP BY status
    `, [workspaceIds, RunEnvironment.PRODUCTION, window.createdAfter, window.createdBefore])

    return new Map(rows.map((row) => [row.status, Number(row.count)]))
}

async function buildStatusTimeseries(workspaceIds: string[], window: ReportWindow): Promise<TenantMetricsStatusPoint[]> {
    const rows: Array<{ day: Date, status: ExecutionStatus, count: string }> = await executionRepo().query(`
        SELECT DATE_TRUNC('day', created) AS day, status, COUNT(*) AS count
        FROM execution
        WHERE "workspaceId" = ANY($1)
          AND environment = $2
          AND "archivedAt" IS NULL
          AND created >= $3
          AND created <= $4
        GROUP BY day, status
        ORDER BY day ASC
    `, [workspaceIds, RunEnvironment.PRODUCTION, window.createdAfter, window.createdBefore])
    return rows.map((row) => ({
        day: dayjs(row.day).toISOString(),
        status: row.status,
        count: Number(row.count),
    }))
}

async function buildInternalErrorImpact(workspaceIds: string[], window: ReportWindow): Promise<InternalErrorImpactItem[]> {
    const rows: Array<{ workspaceId: string, workflowId: string, workspaceName: string | null, workflowName: string | null, count: string }> = await executionRepo().query(`
        SELECT fr."workspaceId" AS "workspaceId",
               fr."workflowId" AS "workflowId",
               MAX(p."displayName") AS "workspaceName",
               MAX(fv."displayName") AS "workflowName",
               COUNT(*) AS count
        FROM execution fr
        LEFT JOIN workflow_version fv ON fv.id = fr."workflowVersionId"
        LEFT JOIN workspace p ON p.id = fr."workspaceId"
        WHERE fr."workspaceId" = ANY($1)
          AND fr.environment = $2
          AND fr."archivedAt" IS NULL
          AND fr.status = $3
          AND fr.created >= $4
          AND fr.created <= $5
        GROUP BY fr."workspaceId", fr."workflowId"
        ORDER BY COUNT(*) DESC
        LIMIT $6
    `, [workspaceIds, RunEnvironment.PRODUCTION, ExecutionStatus.INTERNAL_ERROR, window.createdAfter, window.createdBefore, INTERNAL_ERROR_LIMIT])
    return rows.map((row) => ({
        workspaceId: row.workspaceId,
        workspaceName: row.workspaceName ?? '',
        workflowId: row.workflowId,
        workflowName: row.workflowName ?? '',
        count: Number(row.count),
    }))
}

function previousWindow(window: ReportWindow): ReportWindow {
    const lengthMs = dayjs(window.createdBefore).diff(dayjs(window.createdAfter), 'millisecond')
    return {
        createdAfter: dayjs(window.createdAfter).subtract(lengthMs, 'millisecond').toISOString(),
        createdBefore: window.createdAfter,
    }
}

function summarize(counts: Map<ExecutionStatus, number>): { completed: number, successRate: number } {
    const succeeded = counts.get(ExecutionStatus.SUCCEEDED) ?? 0
    const failed = counts.get(ExecutionStatus.FAILED) ?? 0
    const completed = succeeded + failed
    const successRate = completed === 0 ? 0 : (succeeded / completed) * 100
    return { completed, successRate }
}

async function queueStatusCounts(workspaceIds: string[], window: ReportWindow): Promise<Map<ExecutionStatus, number>> {
    const rows: Array<{ status: ExecutionStatus, count: string }> = await executionRepo().query(`
        SELECT status, COUNT(*) AS count
        FROM execution
        WHERE "workspaceId" = ANY($1)
          AND environment = $2
          AND "archivedAt" IS NULL
          AND status = ANY($3)
          AND created >= $4
          AND created <= $5
        GROUP BY status
    `, [workspaceIds, RunEnvironment.PRODUCTION, [ExecutionStatus.RUNNING, ExecutionStatus.QUEUED], window.createdAfter, window.createdBefore])
    return new Map(rows.map((row) => [row.status, Number(row.count)]))
}

function stuckBeforeIso(): string {
    const workflowTimeoutSeconds = system.getNumberOrThrow(AppSystemProp.WORKFLOW_TIMEOUT_SECONDS)
    return dayjs().subtract(workflowTimeoutSeconds, 'second').toISOString()
}

async function buildStuckJobs(workspaceIds: string[], window: ReportWindow): Promise<StuckJob[]> {
    const rows: Array<{ executionId: string, workflowId: string, workspaceId: string, status: ExecutionStatus, workflowName: string | null, workspaceName: string | null }> = await executionRepo().query(`
        SELECT fr.id AS "executionId",
               fr."workflowId" AS "workflowId",
               fr."workspaceId" AS "workspaceId",
               fr.status AS status,
               fv."displayName" AS "workflowName",
               p."displayName" AS "workspaceName"
        FROM execution fr
        LEFT JOIN workflow_version fv ON fv.id = fr."workflowVersionId"
        LEFT JOIN workspace p ON p.id = fr."workspaceId"
        WHERE fr."workspaceId" = ANY($1)
          AND fr.environment = $2
          AND fr."archivedAt" IS NULL
          AND fr.status = $3
          AND fr."startTime" IS NOT NULL
          AND fr."finishTime" IS NULL
          AND fr."startTime" < $4
          AND fr.created >= $5
          AND fr.created <= $6
        ORDER BY fr."startTime" ASC
        LIMIT $7
    `, [workspaceIds, RunEnvironment.PRODUCTION, ExecutionStatus.RUNNING, stuckBeforeIso(), window.createdAfter, window.createdBefore, STUCK_JOBS_LIMIT])
    return rows.map((row) => ({
        executionId: row.executionId,
        workflowId: row.workflowId,
        workflowName: row.workflowName ?? '',
        workspaceId: row.workspaceId,
        workspaceName: row.workspaceName ?? '',
        status: row.status,
    }))
}

function buildEmptyHealthHistory(): TenantMetricsHealthDay[] {
    return Array.from({ length: HEALTH_HISTORY_DAYS }, (_unused, index) => ({
        day: dayjs().startOf('day').subtract(HEALTH_HISTORY_DAYS - 1 - index, 'day').toISOString(),
        internalErrors: 0,
        affectedWorkflows: 0,
        stuckJobs: 0,
    }))
}

async function buildHealthHistory(workspaceIds: string[]): Promise<TenantMetricsHealthDay[]> {
    const windowStart = dayjs().startOf('day').subtract(HEALTH_HISTORY_DAYS - 1, 'day').toISOString()

    const errorRows: Array<{ day: Date, internalErrors: string, affectedWorkflows: string }> = await executionRepo().query(`
        SELECT DATE_TRUNC('day', created) AS day,
               COUNT(*) AS "internalErrors",
               COUNT(DISTINCT "workflowId") AS "affectedWorkflows"
        FROM execution
        WHERE "workspaceId" = ANY($1)
          AND environment = $2
          AND "archivedAt" IS NULL
          AND status = $3
          AND created >= $4
        GROUP BY day
    `, [workspaceIds, RunEnvironment.PRODUCTION, ExecutionStatus.INTERNAL_ERROR, windowStart])

    const stuckRows: Array<{ day: Date, stuckJobs: string }> = await executionRepo().query(`
        SELECT DATE_TRUNC('day', "startTime") AS day, COUNT(*) AS "stuckJobs"
        FROM execution
        WHERE "workspaceId" = ANY($1)
          AND environment = $2
          AND "archivedAt" IS NULL
          AND status = $3
          AND "startTime" IS NOT NULL
          AND "finishTime" IS NULL
          AND "startTime" >= $4
          AND "startTime" < $5
        GROUP BY day
    `, [workspaceIds, RunEnvironment.PRODUCTION, ExecutionStatus.RUNNING, windowStart, stuckBeforeIso()])

    const errorByDay = new Map(errorRows.map((row) => [dayjs(row.day).format('YYYY-MM-DD'), row]))
    const stuckByDay = new Map(stuckRows.map((row) => [dayjs(row.day).format('YYYY-MM-DD'), row]))

    return Array.from({ length: HEALTH_HISTORY_DAYS }, (_unused, index) => {
        const date = dayjs().startOf('day').subtract(HEALTH_HISTORY_DAYS - 1 - index, 'day')
        const key = date.format('YYYY-MM-DD')
        const error = errorByDay.get(key)
        const stuck = stuckByDay.get(key)
        return {
            day: date.toISOString(),
            internalErrors: Number(error?.internalErrors ?? 0),
            affectedWorkflows: Number(error?.affectedWorkflows ?? 0),
            stuckJobs: Number(stuck?.stuckJobs ?? 0),
        }
    })
}

export const healthMetricsService = (log: FastifyBaseLogger) => ({
    getRunMetrics: async (tenantId: TenantId, window: ReportWindow): Promise<TenantMetricsReport> => {
        const cacheKey = buildReportCacheKey(tenantId, window)
        const cached = await distributedStore.get<TenantMetricsReport>(cacheKey)
        if (cached) {
            return cached
        }

        const nextRefreshAt = dayjs().add(REPORT_TTL_SECONDS, 'second').toISOString()
        const workspaceIds = await workspaceService(log).getWorkspaceIdsByTenant(tenantId)
        if (workspaceIds.length === 0) {
            return { summary: { completed: 0, successRate: 0, previousCompleted: 0, previousSuccessRate: 0 }, statusTimeseries: [], internalErrors: [], nextRefreshAt }
        }

        const [currentCounts, previousCounts, statusTimeseries, internalErrors] = await Promise.all([
            countsByStatus(workspaceIds, window),
            countsByStatus(workspaceIds, previousWindow(window)),
            buildStatusTimeseries(workspaceIds, window),
            buildInternalErrorImpact(workspaceIds, window),
        ])

        const current = summarize(currentCounts)
        const previous = summarize(previousCounts)
        const value: TenantMetricsReport = {
            summary: {
                completed: current.completed,
                successRate: current.successRate,
                previousCompleted: previous.completed,
                previousSuccessRate: previous.successRate,
            },
            statusTimeseries,
            internalErrors,
            nextRefreshAt,
        }
        await distributedStore.put(cacheKey, value, REPORT_TTL_SECONDS)
        return value
    },
    getQueueMetrics: async (tenantId: TenantId, window: ReportWindow): Promise<TenantMetricsLive> => {
        const workspaceIds = await workspaceService(log).getWorkspaceIdsByTenant(tenantId)
        if (workspaceIds.length === 0) {
            return { running: 0, queued: 0, stuckJobs: [] }
        }
        const [counts, stuckJobs] = await Promise.all([
            queueStatusCounts(workspaceIds, window),
            buildStuckJobs(workspaceIds, window),
        ])
        return {
            running: counts.get(ExecutionStatus.RUNNING) ?? 0,
            queued: counts.get(ExecutionStatus.QUEUED) ?? 0,
            stuckJobs,
        }
    },
    getHealthHistory: async (tenantId: TenantId): Promise<TenantMetricsHealthHistory> => {
        const workspaceIds = await workspaceService(log).getWorkspaceIdsByTenant(tenantId)
        if (workspaceIds.length === 0) {
            return { days: buildEmptyHealthHistory() }
        }
        return { days: await buildHealthHistory(workspaceIds) }
    },
})

const REPORT_CACHE_PREFIX = 'health-metrics:report'
const REPORT_TTL_SECONDS = dayjsDuration(6, 'hours').asSeconds() // only run metrics is cached
const HEALTH_HISTORY_DAYS = 30

// Limits for internal errors and stuck jobs . It's unlikely that these will exceed the limit, but even if it does we don't care much about all of them.
const INTERNAL_ERROR_LIMIT = 50
const STUCK_JOBS_LIMIT = 50
