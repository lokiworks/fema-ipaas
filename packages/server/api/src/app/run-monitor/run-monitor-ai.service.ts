import { unique } from '@fema-ipaas/core-utils'
import { AiFeature, LlmProvider, RunEnvironment, RunMonitorAiSource, RunMonitorAiUsage } from '@fema-ipaas/shared'
import { In } from 'typeorm'
import { databaseConnection } from '../database/database-connection'
import { projectRepo } from '../project/project-repo'
import { runMonitorUtils } from './run-monitor-utils'
import { MonitorScope, RUN_MONITOR_SCOPE_SQL } from './run-monitor.service'

export const runMonitorAiService = {
    async usage(scope: MonitorScope): Promise<RunMonitorAiUsage> {
        if (scope.projectIds.length === 0) {
            return EMPTY_USAGE
        }
        const params = [scope.projectIds, scope.workflowIds, new Date(scope.window.from).toISOString(), new Date(scope.window.to).toISOString()]
        const [grouped, workflowRuns, runTotals] = await Promise.all([
            groupedUsage(params),
            runsPerWorkflow(params),
            runsWithAi(params),
        ])
        const rows = grouped.map((row) => ({
            feature: row.feature,
            provider: row.provider,
            model: row.model,
            workflowId: row.workflowId,
            projectId: row.projectId,
            source: runMonitorUtils.aiSource({ feature: row.feature, environment: row.environment }),
            calls: Number(row.calls),
            inputTokens: Number(row.inputTokens),
            outputTokens: Number(row.outputTokens),
        }))
        const workflowIds = unique(rows.map((row) => row.workflowId).filter((id): id is string => id !== null))
        const [names, projects] = await Promise.all([
            workflowDisplayNames(workflowIds),
            projectRepo().find({ where: { id: In(unique(rows.map((row) => row.projectId))), tenantId: scope.tenantId }, select: ['id', 'displayName'] }),
        ])
        return {
            totals: sumOf(rows),
            runs: runTotals.runs,
            runsWithAi: runTotals.withAi,
            byModel: groupBy({ rows, keyOf: (row) => `${row.provider}\u0000${row.model}` })
                .map((group) => ({ ...sumOf(group), provider: group[0].provider, model: group[0].model }))
                .sort(byTokensDesc),
            bySource: SOURCE_ORDER.map((source) => ({ ...sumOf(rows.filter((row) => row.source === source)), source })),
            byWorkflow: groupBy({ rows: rows.filter((row) => row.workflowId !== null), keyOf: (row) => row.workflowId ?? '' })
                .map((group) => {
                    const workflowId = group[0].workflowId ?? ''
                    const projectId = group[0].projectId
                    return {
                        ...sumOf(group),
                        workflowId,
                        workflowDisplayName: names.get(workflowId) ?? workflowId,
                        projectId,
                        projectDisplayName: projects.find((project) => project.id === projectId)?.displayName ?? projectId,
                        models: unique(group.map((row) => row.model)),
                        runs: workflowRuns.get(workflowId) ?? 0,
                    }
                })
                .sort(byTokensDesc)
                .slice(0, MAX_WORKFLOWS),
        }
    },
}

async function groupedUsage(params: unknown[]): Promise<RawUsageRow[]> {
    return databaseConnection().query(
        `SELECT u.feature AS feature, u.provider AS provider, u.model AS model, u."workflowId" AS "workflowId", u."projectId" AS "projectId",
            ex.environment AS environment, COUNT(*) AS calls,
            COALESCE(SUM(u."inputTokens"), 0) AS "inputTokens", COALESCE(SUM(u."outputTokens"), 0) AS "outputTokens"
        FROM "ai_usage" u
        LEFT JOIN "execution" ex ON ex.id = u."executionId"
        WHERE ${USAGE_SCOPE_SQL}
        GROUP BY 1, 2, 3, 4, 5, 6`,
        params,
    )
}

async function runsPerWorkflow(params: unknown[]): Promise<Map<string, number>> {
    const rows: { workflowId: string, runs: string }[] = await databaseConnection().query(
        `SELECT u."workflowId" AS "workflowId", COUNT(DISTINCT u."executionId") AS runs
        FROM "ai_usage" u
        JOIN "execution" ex ON ex.id = u."executionId" AND ex.environment = '${RunEnvironment.PRODUCTION}'
        WHERE ${USAGE_SCOPE_SQL} AND u."workflowId" IS NOT NULL
        GROUP BY 1`,
        params,
    )
    return new Map(rows.map((row) => [row.workflowId, Number(row.runs)]))
}

async function runsWithAi(params: unknown[]): Promise<{ runs: number, withAi: number }> {
    const [totalRows, aiRows]: [{ count: string }[], { count: string }[]] = await Promise.all([
        databaseConnection().query(
            `SELECT COUNT(*) AS count FROM "execution" e WHERE ${RUN_MONITOR_SCOPE_SQL} AND e.created >= $3 AND e.created <= $4`,
            params,
        ),
        databaseConnection().query(
            `SELECT COUNT(DISTINCT u."executionId") AS count
            FROM "ai_usage" u
            JOIN "execution" e ON e.id = u."executionId"
            WHERE u."projectId" = ANY($1::varchar[]) AND u.created >= $3 AND u.created <= $4
            AND ${RUN_MONITOR_SCOPE_SQL} AND e.created >= $3 AND e.created <= $4`,
            params,
        ),
    ])
    return { runs: Number(totalRows[0]?.count ?? 0), withAi: Number(aiRows[0]?.count ?? 0) }
}

async function workflowDisplayNames(workflowIds: string[]): Promise<Map<string, string>> {
    if (workflowIds.length === 0) {
        return new Map()
    }
    const rows: { id: string, displayName: string | null }[] = await databaseConnection().query(
        `SELECT w.id AS id, latest."displayName" AS "displayName"
        FROM "workflow" w
        LEFT JOIN LATERAL (
            SELECT v."displayName" FROM "workflow_version" v WHERE v."workflowId" = w.id ORDER BY v.created DESC LIMIT 1
        ) latest ON true
        WHERE w.id = ANY($1::varchar[])`,
        [workflowIds],
    )
    return new Map(rows.map((row) => [row.id, row.displayName ?? row.id]))
}

function groupBy<T>({ rows, keyOf }: { rows: T[], keyOf: (row: T) => string }): T[][] {
    const groups = rows.reduce((acc, row) => {
        const key = keyOf(row)
        return new Map(acc).set(key, [...(acc.get(key) ?? []), row])
    }, new Map<string, T[]>())
    return [...groups.values()]
}

function sumOf(rows: { calls: number, inputTokens: number, outputTokens: number }[]): { calls: number, inputTokens: number, outputTokens: number } {
    return rows.reduce((acc, row) => ({
        calls: acc.calls + row.calls,
        inputTokens: acc.inputTokens + row.inputTokens,
        outputTokens: acc.outputTokens + row.outputTokens,
    }), { calls: 0, inputTokens: 0, outputTokens: 0 })
}

function byTokensDesc(a: { inputTokens: number, outputTokens: number }, b: { inputTokens: number, outputTokens: number }): number {
    return (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens)
}

const USAGE_SCOPE_SQL = `u."projectId" = ANY($1::varchar[])
    AND (cardinality($2::varchar[]) = 0 OR u."workflowId" = ANY($2::varchar[]))
    AND u.created >= $3 AND u.created <= $4`

const SOURCE_ORDER: RunMonitorAiSource[] = [
    RunMonitorAiSource.WORKFLOW_RUN,
    RunMonitorAiSource.DEBUG_RUN,
    RunMonitorAiSource.EDITOR_ASSISTANT,
    RunMonitorAiSource.AUTO_MAPPING,
    RunMonitorAiSource.GENERATE_WORKFLOW,
]

const MAX_WORKFLOWS = 50

const EMPTY_USAGE: RunMonitorAiUsage = {
    totals: { calls: 0, inputTokens: 0, outputTokens: 0 },
    runs: 0,
    runsWithAi: 0,
    byModel: [],
    bySource: SOURCE_ORDER.map((source) => ({ source, calls: 0, inputTokens: 0, outputTokens: 0 })),
    byWorkflow: [],
}

type RawUsageRow = {
    feature: AiFeature
    provider: LlmProvider
    model: string
    workflowId: string | null
    projectId: string
    environment: string | null
    calls: string
    inputTokens: string
    outputTokens: string
}
