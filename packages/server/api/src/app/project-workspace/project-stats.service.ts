import { isNil, ProjectId } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import { ExecutionStatus, ProjectOverviewStats, ProjectWorkflowStats, RunEnvironment, WorkflowVersionState } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { executionRepo } from '../workflows/execution/execution-service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { projectStatsUtils } from './project-stats-utils'

export const projectStatsService = (_log: FastifyBaseLogger) => ({
    async getStats({ projectId }: { projectId: ProjectId }): Promise<ProjectOverviewStats> {
        const now = dayjsUtil()
        const since7d = now.subtract(7, 'day').toISOString()
        const since14d = now.subtract(14, 'day').toISOString()
        const monthStart = now.startOf('month').toISOString()
        const failedStatuses = projectStatsUtils.FAILED_STATUSES

        const [perWorkflow, lastRuns, totals, versionRows, workflows] = await Promise.all([
            executionRepo().query(
                `SELECT e."workflowId" AS "workflowId",
                        COUNT(*)::int AS "runs",
                        COUNT(*) FILTER (WHERE e.status = $3)::int AS "succeeded",
                        COUNT(*) FILTER (WHERE e.status = ANY($4))::int AS "failed"
                 FROM execution e
                 WHERE e."projectId" = $1 AND e.environment = $5 AND e."archivedAt" IS NULL AND e.created >= $2
                 GROUP BY e."workflowId"`,
                [projectId, since7d, ExecutionStatus.SUCCEEDED, failedStatuses, RunEnvironment.PRODUCTION],
            ),
            executionRepo().query(
                `SELECT DISTINCT ON (e."workflowId") e."workflowId" AS "workflowId", e.created AS "created", e.status AS "status"
                 FROM execution e
                 WHERE e."projectId" = $1 AND e.environment = $2 AND e."archivedAt" IS NULL AND e.created >= $3
                 ORDER BY e."workflowId", e.created DESC`,
                [projectId, RunEnvironment.PRODUCTION, now.subtract(LAST_RUN_LOOKBACK_DAYS, 'day').toISOString()],
            ),
            executionRepo().query(
                `SELECT COUNT(*) FILTER (WHERE e.created >= $2)::int AS "last7d",
                        COUNT(*) FILTER (WHERE e.created >= $3 AND e.created < $2)::int AS "previous7d",
                        COUNT(*) FILTER (WHERE e.created >= $2 AND e.status = $5)::int AS "succeeded7d",
                        COUNT(*) FILTER (WHERE e.created >= $2 AND e.status = ANY($6))::int AS "failed7d",
                        COUNT(*) FILTER (WHERE e.created >= $4)::int AS "thisMonth"
                 FROM execution e
                 WHERE e."projectId" = $1 AND e.environment = $7 AND e."archivedAt" IS NULL AND e.created >= LEAST($3::timestamptz, $4::timestamptz)`,
                [projectId, since7d, since14d, monthStart, ExecutionStatus.SUCCEEDED, failedStatuses, RunEnvironment.PRODUCTION],
            ),
            workflowRepo().query(
                `SELECT v."workflowId" AS "workflowId", v.id AS "versionId",
                        ROW_NUMBER() OVER (PARTITION BY v."workflowId" ORDER BY v.created ASC)::int AS "number"
                 FROM workflow_version v
                 INNER JOIN workflow w ON w.id = v."workflowId"
                 WHERE w."projectId" = $1 AND v.state = $2`,
                [projectId, WorkflowVersionState.LOCKED],
            ),
            workflowRepo().find({ where: { projectId }, select: ['id', 'publishedVersionId', 'testVersionId'] }),
        ])

        const versionNumbers = new Map<string, number>(versionRows.map((row: VersionRow) => [row.versionId, row.number]))
        const aggregates = new Map<string, AggregateRow>(perWorkflow.map((row: AggregateRow) => [row.workflowId, row]))
        const latest = new Map<string, LastRunRow>(lastRuns.map((row: LastRunRow) => [row.workflowId, row]))
        const total: TotalsRow = totals[0] ?? { last7d: 0, previous7d: 0, succeeded7d: 0, failed7d: 0, thisMonth: 0 }

        const workflowStats: ProjectWorkflowStats[] = workflows.map((workflow) => {
            const aggregate = aggregates.get(workflow.id)
            const lastRun = latest.get(workflow.id)
            return {
                workflowId: workflow.id,
                lastRunAt: isNil(lastRun) ? null : new Date(lastRun.created).toISOString(),
                lastRunStatus: lastRun?.status ?? null,
                runs7d: aggregate?.runs ?? 0,
                succeeded7d: aggregate?.succeeded ?? 0,
                failed7d: aggregate?.failed ?? 0,
                productionVersionNumber: isNil(workflow.publishedVersionId) ? null : versionNumbers.get(workflow.publishedVersionId) ?? null,
                testVersionNumber: isNil(workflow.testVersionId) ? null : versionNumbers.get(workflow.testVersionId) ?? null,
            }
        })

        return {
            workflows: workflowStats,
            runs: {
                last7d: total.last7d,
                previous7d: total.previous7d,
                succeeded7d: total.succeeded7d,
                failed7d: total.failed7d,
                thisMonth: total.thisMonth,
            },
        }
    },
})

const LAST_RUN_LOOKBACK_DAYS = 30

type AggregateRow = {
    workflowId: string
    runs: number
    succeeded: number
    failed: number
}

type LastRunRow = {
    workflowId: string
    created: string | Date
    status: ExecutionStatus
}

type TotalsRow = {
    last7d: number
    previous7d: number
    succeeded7d: number
    failed7d: number
    thisMonth: number
}

type VersionRow = {
    workflowId: string
    versionId: string
    number: number
}
