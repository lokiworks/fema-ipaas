import { isNil, unique } from '@fema-ipaas/core-utils'
import {
    ExecutionStatus,
    RUN_MONITOR_MAX_WORKFLOW_ROWS,
    RunEnvironment,
    RunMonitorOptions,
    RunMonitorQuery,
    RunMonitorStats,
    RunMonitorSummary,
    RunMonitorWorkflowRow,
    WorkflowOperationStatus,
    WorkflowStatus,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { connectionAccessService } from '../connection/connection-access.service'
import { databaseConnection } from '../database/database-connection'
import { projectRepo } from '../project/project-repo'
import { MonitorWindow, runMonitorUtils } from './run-monitor-utils'

export const runMonitorService = (log: FastifyBaseLogger) => ({
    async resolveScope({ userId, tenantId, query, now }: ResolveScopeParams): Promise<MonitorScope> {
        const memberProjectIds = await connectionAccessService(log).memberProjectIds({ userId, tenantId })
        const requested = query.projectIds ?? []
        const projectIds = requested.length === 0 ? memberProjectIds : unique(requested).filter((id) => memberProjectIds.includes(id))
        const timezone = runMonitorUtils.safeTimezone(query.timezone)
        return {
            tenantId,
            projectIds,
            workflowIds: unique(query.workflowIds ?? []),
            range: query.range,
            timezone,
            window: runMonitorUtils.timeWindow({ range: query.range, now: now.getTime(), timezone }),
        }
    },

    async summary(scope: MonitorScope): Promise<RunMonitorSummary> {
        const spec = runMonitorUtils.rangeSpec(scope.range)
        const base = {
            range: scope.range,
            timezone: scope.timezone,
            unit: spec.unit,
            step: spec.step,
            from: new Date(scope.window.from).toISOString(),
            to: new Date(scope.window.to).toISOString(),
            previousFrom: new Date(scope.window.previousFrom).toISOString(),
        }
        if (scope.projectIds.length === 0) {
            return {
                ...base,
                stats: EMPTY_STATS,
                buckets: runMonitorUtils.fillBuckets({ starts: scope.window.starts, to: scope.window.to, rows: [] }),
                byStatus: [],
                workflows: [],
                workflowsTruncated: false,
            }
        }
        const [statusRows, previousRuns, bucketRows, workflowCounts, activeWorkflows, peak, workflowRows] = await Promise.all([
            statusCounts(scope),
            previousRunCount(scope),
            bucketCounts(scope),
            workflowScopeCounts(scope),
            activeWorkflowCount(scope),
            peakConcurrency(scope),
            workflowDetails(scope),
        ])
        const totals = runMonitorUtils.countsOf(statusRows)
        const runs = statusRows.reduce((sum, row) => sum + row.count, 0)
        return {
            ...base,
            stats: {
                runs,
                previousRuns,
                ...totals,
                finished: runs - totals.running,
                enabledWorkflows: workflowCounts.enabled,
                workflowsInScope: workflowCounts.total,
                activeWorkflows,
                executedSteps: runMonitorUtils.executedStepsOf(statusRows),
                peakConcurrency: peak.count,
                peakAt: peak.at,
            },
            buckets: runMonitorUtils.fillBuckets({ starts: scope.window.starts, to: scope.window.to, rows: bucketRows }),
            byStatus: statusRows.map((row) => ({ status: row.status, count: row.count })),
            workflows: workflowRows.rows,
            workflowsTruncated: workflowRows.truncated,
        }
    },

    async options({ userId, tenantId }: { userId: string, tenantId: string }): Promise<RunMonitorOptions> {
        const projectIds = await connectionAccessService(log).memberProjectIds({ userId, tenantId })
        if (projectIds.length === 0) {
            return { projects: [], workflows: [] }
        }
        const [projects, workflows] = await Promise.all([
            projectRepo().find({ where: { id: In(projectIds), tenantId }, select: ['id', 'displayName'], order: { displayName: 'ASC' } }),
            workflowNames({ projectIds, workflowIds: [] }),
        ])
        return {
            projects: projects.map((project) => ({ id: project.id, displayName: project.displayName })),
            workflows: workflows.map((workflow) => ({ id: workflow.id, projectId: workflow.projectId, displayName: workflow.displayName ?? workflow.id, status: workflow.status })),
        }
    },
})

async function statusCounts(scope: MonitorScope): Promise<StatusStepsRow[]> {
    const rows: RawStatusStepsRow[] = await databaseConnection().query(
        `SELECT e.status AS status, COUNT(*) AS count, COALESCE(SUM(e."stepsCount"), 0) AS steps
        FROM "execution" e
        WHERE ${SCOPE_SQL} AND e.created >= $3 AND e.created <= $4
        GROUP BY e.status`,
        [...scopeParams(scope), isoOf(scope.window.from), isoOf(scope.window.to)],
    )
    return rows.map((row) => ({ status: row.status, count: Number(row.count), steps: Number(row.steps) }))
}

async function previousRunCount(scope: MonitorScope): Promise<number> {
    const rows: { count: string }[] = await databaseConnection().query(
        `SELECT COUNT(*) AS count FROM "execution" e WHERE ${SCOPE_SQL} AND e.created >= $3 AND e.created < $4`,
        [...scopeParams(scope), isoOf(scope.window.previousFrom), isoOf(scope.window.from)],
    )
    return Number(rows[0]?.count ?? 0)
}

async function bucketCounts(scope: MonitorScope): Promise<{ bucket: number, status: ExecutionStatus, count: number }[]> {
    const rows: { bucket: number | string, status: ExecutionStatus, count: string }[] = await databaseConnection().query(
        `SELECT width_bucket(e.created, $5::timestamptz[]) AS bucket, e.status AS status, COUNT(*) AS count
        FROM "execution" e
        WHERE ${SCOPE_SQL} AND e.created >= $3 AND e.created <= $4
        GROUP BY 1, 2`,
        [...scopeParams(scope), isoOf(scope.window.from), isoOf(scope.window.to), scope.window.starts.map(isoOf)],
    )
    return rows.map((row) => ({ bucket: Number(row.bucket), status: row.status, count: Number(row.count) }))
}

async function workflowScopeCounts(scope: MonitorScope): Promise<{ total: number, enabled: number }> {
    const rows: { total: string, enabled: string }[] = await databaseConnection().query(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE w.status = '${WorkflowStatus.ENABLED}') AS enabled
        FROM "workflow" w
        WHERE w."projectId" = ANY($1::varchar[])
        AND (cardinality($2::varchar[]) = 0 OR w.id = ANY($2::varchar[]))
        AND w."operationStatus" != '${WorkflowOperationStatus.DELETING}'`,
        scopeParams(scope),
    )
    return { total: Number(rows[0]?.total ?? 0), enabled: Number(rows[0]?.enabled ?? 0) }
}

async function activeWorkflowCount(scope: MonitorScope): Promise<number> {
    const rows: { count: string }[] = await databaseConnection().query(
        `SELECT COUNT(DISTINCT e."workflowId") AS count
        FROM "execution" e
        WHERE ${SCOPE_SQL} AND e.status = ANY($3::varchar[]) AND e.created >= $4`,
        [...scopeParams(scope), runMonitorUtils.activeStatuses, isoOf(scope.window.to - ACTIVE_LOOKBACK_MS)],
    )
    return Number(rows[0]?.count ?? 0)
}

async function peakConcurrency(scope: MonitorScope): Promise<{ count: number, at: string | null }> {
    const rows: { at: Date | string, count: string }[] = await databaseConnection().query(
        `WITH spans AS (
            SELECT GREATEST(e."startTime", $3::timestamptz) AS s,
                LEAST(COALESCE(e."finishTime", CASE WHEN e.status = ANY($6::varchar[]) THEN $4::timestamptz ELSE e."startTime" END), $4::timestamptz) AS f
            FROM "execution" e
            WHERE ${SCOPE_SQL} AND e."startTime" IS NOT NULL AND e.created >= $5 AND e.created <= $4
        ), events AS (
            SELECT s AS t, 1 AS d FROM spans WHERE f > s
            UNION ALL
            SELECT f AS t, -1 AS d FROM spans WHERE f > s
        ), running AS (
            SELECT t, SUM(d) OVER (ORDER BY t, d ROWS UNBOUNDED PRECEDING) AS c FROM events
        )
        SELECT t AS at, c AS count FROM running ORDER BY c DESC, t ASC LIMIT 1`,
        [...scopeParams(scope), isoOf(scope.window.from), isoOf(scope.window.to), isoOf(scope.window.from - PEAK_LOOKBACK_MS), runMonitorUtils.activeStatuses],
    )
    const top = rows[0]
    if (isNil(top) || Number(top.count) <= 0) {
        return { count: 0, at: null }
    }
    return { count: Number(top.count), at: new Date(top.at).toISOString() }
}

async function workflowDetails(scope: MonitorScope): Promise<{ rows: RunMonitorWorkflowRow[], truncated: boolean }> {
    const aggregates: RawWorkflowAggregate[] = await databaseConnection().query(
        `SELECT e."workflowId" AS "workflowId", e."projectId" AS "projectId", COUNT(*) AS runs, MAX(e.created) AS "lastRunAt",
            AVG(d.ms) AS "avgMs",
            percentile_cont(0.95) WITHIN GROUP (ORDER BY d.ms) AS "p95Ms"
        FROM "execution" e
        CROSS JOIN LATERAL (
            SELECT CASE WHEN e."startTime" IS NOT NULL AND e."finishTime" IS NOT NULL AND NOT (e.status = ANY($5::varchar[]))
                THEN EXTRACT(EPOCH FROM (e."finishTime" - e."startTime")) * 1000 END AS ms
        ) d
        WHERE ${SCOPE_SQL} AND e.created >= $3 AND e.created <= $4
        GROUP BY e."workflowId", e."projectId"
        ORDER BY runs DESC, "lastRunAt" DESC
        LIMIT ${RUN_MONITOR_MAX_WORKFLOW_ROWS + 1}`,
        [...scopeParams(scope), isoOf(scope.window.from), isoOf(scope.window.to), runMonitorUtils.activeStatuses],
    )
    const truncated = aggregates.length > RUN_MONITOR_MAX_WORKFLOW_ROWS
    const shown = aggregates.slice(0, RUN_MONITOR_MAX_WORKFLOW_ROWS)
    if (shown.length === 0) {
        return { rows: [], truncated: false }
    }
    const workflowIds = shown.map((row) => row.workflowId)
    const [breakdown, names, projects] = await Promise.all([
        workflowBreakdown({ scope, workflowIds }),
        workflowNames({ projectIds: scope.projectIds, workflowIds }),
        projectRepo().find({ where: { id: In(unique(shown.map((row) => row.projectId))), tenantId: scope.tenantId }, select: ['id', 'displayName'] }),
    ])
    const rows = shown.map((row) => {
        const mine = breakdown.filter((item) => item.workflowId === row.workflowId)
        return {
            workflowId: row.workflowId,
            workflowDisplayName: names.find((name) => name.id === row.workflowId)?.displayName ?? row.workflowId,
            projectId: row.projectId,
            projectDisplayName: projects.find((project) => project.id === row.projectId)?.displayName ?? row.projectId,
            runs: Number(row.runs),
            ...runMonitorUtils.countsOf(mine),
            avgDurationMs: roundOrNull(runMonitorUtils.toNumberOrNull(row.avgMs)),
            p95DurationMs: roundOrNull(runMonitorUtils.toNumberOrNull(row.p95Ms)),
            lastRunAt: new Date(row.lastRunAt).toISOString(),
            trend: runMonitorUtils.trendOf({ count: scope.window.starts.length, rows: mine }),
        }
    })
    return { rows, truncated }
}

async function workflowBreakdown({ scope, workflowIds }: { scope: MonitorScope, workflowIds: string[] }): Promise<{ workflowId: string, bucket: number, status: ExecutionStatus, count: number }[]> {
    const rows: { workflowId: string, bucket: number | string, status: ExecutionStatus, count: string }[] = await databaseConnection().query(
        `SELECT e."workflowId" AS "workflowId", width_bucket(e.created, $5::timestamptz[]) AS bucket, e.status AS status, COUNT(*) AS count
        FROM "execution" e
        WHERE e."projectId" = ANY($1::varchar[]) AND e."workflowId" = ANY($2::varchar[])
        AND e.environment = '${RunEnvironment.PRODUCTION}' AND e."archivedAt" IS NULL
        AND e.created >= $3 AND e.created <= $4
        GROUP BY 1, 2, 3`,
        [scope.projectIds, workflowIds, isoOf(scope.window.from), isoOf(scope.window.to), scope.window.starts.map(isoOf)],
    )
    return rows.map((row) => ({ workflowId: row.workflowId, bucket: Number(row.bucket), status: row.status, count: Number(row.count) }))
}

async function workflowNames({ projectIds, workflowIds }: { projectIds: string[], workflowIds: string[] }): Promise<WorkflowNameRow[]> {
    return databaseConnection().query(
        `SELECT w.id AS id, w."projectId" AS "projectId", w.status AS status, latest."displayName" AS "displayName"
        FROM "workflow" w
        LEFT JOIN LATERAL (
            SELECT v."displayName" FROM "workflow_version" v WHERE v."workflowId" = w.id ORDER BY v.created DESC LIMIT 1
        ) latest ON true
        WHERE w."projectId" = ANY($1::varchar[])
        AND (cardinality($2::varchar[]) = 0 OR w.id = ANY($2::varchar[]))
        AND w."operationStatus" != '${WorkflowOperationStatus.DELETING}'
        ORDER BY latest."displayName" ASC NULLS LAST
        LIMIT ${MAX_WORKFLOW_OPTIONS}`,
        [projectIds, workflowIds],
    )
}

function scopeParams(scope: MonitorScope): [string[], string[]] {
    return [scope.projectIds, scope.workflowIds]
}

function isoOf(instant: number): string {
    return new Date(instant).toISOString()
}

function roundOrNull(value: number | null): number | null {
    return isNil(value) ? null : Math.round(value)
}

const SCOPE_SQL = `e."projectId" = ANY($1::varchar[])
    AND (cardinality($2::varchar[]) = 0 OR e."workflowId" = ANY($2::varchar[]))
    AND e.environment = '${RunEnvironment.PRODUCTION}'
    AND e."archivedAt" IS NULL`

const ACTIVE_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000
const PEAK_LOOKBACK_MS = 24 * 60 * 60 * 1000
const MAX_WORKFLOW_OPTIONS = 2000

const EMPTY_STATS: RunMonitorStats = {
    runs: 0,
    previousRuns: 0,
    succeeded: 0,
    failed: 0,
    terminated: 0,
    running: 0,
    finished: 0,
    enabledWorkflows: 0,
    workflowsInScope: 0,
    activeWorkflows: 0,
    executedSteps: 0,
    peakConcurrency: 0,
    peakAt: null,
}

export const RUN_MONITOR_SCOPE_SQL = SCOPE_SQL

export type MonitorScope = {
    tenantId: string
    projectIds: string[]
    workflowIds: string[]
    range: RunMonitorQuery['range']
    timezone: string
    window: MonitorWindow
}

type ResolveScopeParams = {
    userId: string
    tenantId: string
    query: RunMonitorQuery
    now: Date
}

type RawStatusStepsRow = {
    status: ExecutionStatus
    count: string
    steps: string
}

type StatusStepsRow = {
    status: ExecutionStatus
    count: number
    steps: number
}

type RawWorkflowAggregate = {
    workflowId: string
    projectId: string
    runs: string
    lastRunAt: Date | string
    avgMs: string | number | null
    p95Ms: string | number | null
}

type WorkflowNameRow = {
    id: string
    projectId: string
    status: WorkflowStatus
    displayName: string | null
}
