import { generateId, isNil, ProjectId, tryCatch, WorkflowId, WorkflowVersionId } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import { Execution, ExecutionStatus, RunEnvironment } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../core/db/repo-factory'
import { distributedStore, redisConnections } from '../database/redis-connections'
import { projectRepo } from '../project/project-repo'
import { ExecutionEntity } from '../workflows/execution/execution-entity'
import { runsMetadataQueue } from '../workflows/execution/executions-queue'
import { instanceLimits } from './instance-limits'
import { runQuotaUtils, RunQuotaVerdict } from './run-quota-utils'

export const runQuota = (log: FastifyBaseLogger) => ({
    async admit({ projectId }: { projectId: ProjectId }): Promise<RunQuotaVerdict> {
        const { data, error } = await tryCatch(async () => {
            const month = runQuotaUtils.monthOf(dayjsUtil())
            const [projectUsed, instanceUsed] = await readCounters({ month, projectId })
            const verdict = runQuotaUtils.decide({
                projectUsed,
                projectLimit: await projectMonthlyLimit({ projectId }),
                instanceUsed,
                instanceLimit: instanceLimits.runsPerMonth(),
            })
            if (verdict.allowed) {
                await increment({ month, projectId })
            }
            return verdict
        })
        if (error) {
            log.warn({ project: { id: projectId }, error: String(error) }, '[runQuota#admit] Could not check the monthly run limit, allowing the run')
            return { allowed: true }
        }
        return data
    },

    async usageThisMonth({ projectIds }: { projectIds: ProjectId[] }): Promise<Map<ProjectId, number>> {
        if (projectIds.length === 0) {
            return new Map()
        }
        const month = runQuotaUtils.monthOf(dayjsUtil())
        const { data, error } = await tryCatch(async () => {
            await Promise.all(projectIds.map((projectId) => ensureSeeded({ month, projectId })))
            const redis = await redisConnections.useExisting()
            const values = await redis.mget(...projectIds.map((projectId) => projectCounterKey({ month, projectId })))
            return new Map(projectIds.map((projectId, index) => [projectId, Number(values[index] ?? 0)]))
        })
        if (error) {
            log.warn({ error: String(error) }, '[runQuota#usageThisMonth] Falling back to counting runs in the database')
            return countProjectsFromDatabase({ projectIds, since: runQuotaUtils.monthStart(dayjsUtil()) })
        }
        return data
    },

    async instanceUsageThisMonth(): Promise<number> {
        const month = runQuotaUtils.monthOf(dayjsUtil())
        const { data, error } = await tryCatch(async () => {
            await ensureInstanceSeeded({ month })
            const redis = await redisConnections.useExisting()
            return Number(await redis.get(instanceCounterKey({ month })) ?? 0)
        })
        if (error) {
            return countInstanceFromDatabase({ since: runQuotaUtils.monthStart(dayjsUtil()) })
        }
        return data
    },

    async invalidateProjectLimit({ projectId }: { projectId: ProjectId }): Promise<void> {
        await tryCatch(() => distributedStore.delete(projectLimitCacheKey(projectId)))
    },

    async recordRejectedRun({ projectId, workflowId, workflowVersionId, parentRunId, failParentOnFailure, verdict }: RecordRejectedRunParams): Promise<Execution> {
        const now = dayjsUtil().toISOString()
        const execution: Execution = {
            id: generateId(),
            projectId,
            workflowId,
            workflowVersionId,
            environment: RunEnvironment.PRODUCTION,
            parentRunId,
            failParentOnFailure: failParentOnFailure ?? true,
            status: ExecutionStatus.FAILED,
            created: now,
            updated: now,
            startTime: now,
            finishTime: now,
            tags: [],
            steps: {},
            failedStep: {
                name: RUN_LIMIT_STEP_NAME,
                displayName: RUN_LIMIT_STEP_NAME,
                message: runQuotaUtils.rejectionMessage(verdict),
            },
        }
        await runsMetadataQueue(log).add(execution)
        log.info({ execution: { id: execution.id }, project: { id: projectId }, workflow: { id: workflowId } }, '[runQuota] Run rejected because the monthly run limit is reached')
        return execution
    },
})

const executionRepo = repoFactory<Execution>(ExecutionEntity)

async function readCounters({ month, projectId }: { month: string, projectId: ProjectId }): Promise<[number, number]> {
    await Promise.all([ensureSeeded({ month, projectId }), ensureInstanceSeeded({ month })])
    const redis = await redisConnections.useExisting()
    const [project, instance] = await redis.mget(projectCounterKey({ month, projectId }), instanceCounterKey({ month }))
    return [Number(project ?? 0), Number(instance ?? 0)]
}

async function increment({ month, projectId }: { month: string, projectId: ProjectId }): Promise<void> {
    const redis = await redisConnections.useExisting()
    await redis.multi()
        .incr(projectCounterKey({ month, projectId }))
        .incr(instanceCounterKey({ month }))
        .exec()
}

async function ensureSeeded({ month, projectId }: { month: string, projectId: ProjectId }): Promise<void> {
    const redis = await redisConnections.useExisting()
    const key = projectCounterKey({ month, projectId })
    if (await redis.exists(key) === 1) {
        return
    }
    const counts = await countProjectsFromDatabase({ projectIds: [projectId], since: runQuotaUtils.monthStartOf(month) })
    await redis.set(key, String(counts.get(projectId) ?? 0), 'EX', COUNTER_TTL_SECONDS, 'NX')
}

async function ensureInstanceSeeded({ month }: { month: string }): Promise<void> {
    const redis = await redisConnections.useExisting()
    const key = instanceCounterKey({ month })
    if (await redis.exists(key) === 1) {
        return
    }
    const count = await countInstanceFromDatabase({ since: runQuotaUtils.monthStartOf(month) })
    await redis.set(key, String(count), 'EX', COUNTER_TTL_SECONDS, 'NX')
}

async function countProjectsFromDatabase({ projectIds, since }: { projectIds: ProjectId[], since: string }): Promise<Map<ProjectId, number>> {
    const rows: { projectId: string, count: number }[] = await executionRepo().query(
        `SELECT e."projectId" AS "projectId", COUNT(*)::int AS "count"
         FROM execution e
         WHERE e."projectId" = ANY($1) AND e.environment = $2 AND e.created >= $3
         GROUP BY e."projectId"`,
        [projectIds, RunEnvironment.PRODUCTION, since],
    )
    const counted = new Map(rows.map((row) => [row.projectId, Number(row.count)]))
    return new Map(projectIds.map((projectId) => [projectId, counted.get(projectId) ?? 0]))
}

async function countInstanceFromDatabase({ since }: { since: string }): Promise<number> {
    const rows: { count: number }[] = await executionRepo().query(
        'SELECT COUNT(*)::int AS "count" FROM execution e WHERE e.environment = $1 AND e.created >= $2',
        [RunEnvironment.PRODUCTION, since],
    )
    return Number(rows[0]?.count ?? 0)
}

async function projectMonthlyLimit({ projectId }: { projectId: ProjectId }): Promise<number | null> {
    const cached = await distributedStore.get<{ limit: number | null }>(projectLimitCacheKey(projectId))
    if (!isNil(cached)) {
        return cached.limit
    }
    const project = await projectRepo().findOne({ where: { id: projectId }, select: ['id', 'monthlyRunsLimit'] })
    const limit = project?.monthlyRunsLimit ?? null
    await distributedStore.put(projectLimitCacheKey(projectId), { limit }, PROJECT_LIMIT_CACHE_TTL_SECONDS)
    return limit
}

function projectCounterKey({ month, projectId }: { month: string, projectId: ProjectId }): string {
    return `run-quota:v1:${month}:project:${projectId}`
}

function instanceCounterKey({ month }: { month: string }): string {
    return `run-quota:v1:${month}:instance`
}

function projectLimitCacheKey(projectId: ProjectId): string {
    return `run-quota:project-limit:v1:${projectId}`
}

const COUNTER_TTL_SECONDS = 40 * 24 * 60 * 60
const PROJECT_LIMIT_CACHE_TTL_SECONDS = 60
const RUN_LIMIT_STEP_NAME = 'run_limit'

type RecordRejectedRunParams = {
    projectId: ProjectId
    workflowId: WorkflowId
    workflowVersionId: WorkflowVersionId
    parentRunId?: string
    failParentOnFailure?: boolean
    verdict: RunQuotaVerdict
}
