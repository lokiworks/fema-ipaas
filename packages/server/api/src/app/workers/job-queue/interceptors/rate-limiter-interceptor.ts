import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { dayjsDuration } from '@fema-ipaas/server-utils'
import { ExecuteWorkflowJobData, JOB_PRIORITY, JobData, RATE_LIMIT_PRIORITY, RunEnvironment, WorkerJobType } from '@fema-ipaas/shared'
import { Job } from 'bullmq'
import { FastifyBaseLogger } from 'fastify'
import { getConcurrencyPoolSetKey } from '../../../database/redis/keys'
import { distributedStore, redisConnections } from '../../../database/redis-connections'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { projectService } from '../../../project/project-service'
import { tenantLimitsService } from '../../../tenant/tenant-limits.service'
import { InterceptorResult, InterceptorVerdict, JobInterceptor } from '../job-interceptor'

const RATE_LIMIT_WORKER_JOB_TYPES = [WorkerJobType.EXECUTE_WORKFLOW]
const PROJECT_CONCURRENCY_TTL_SECONDS = 60

function isLimitableJob(jobData: JobData): jobData is ExecuteWorkflowJobData {
    if (!RATE_LIMIT_WORKER_JOB_TYPES.includes(jobData.jobType)) {
        return false
    }
    const castedJob = jobData as ExecuteWorkflowJobData
    if (castedJob.environment === RunEnvironment.TESTING) {
        return false
    }
    return true
}

function isProjectLimiterEnabled(): boolean {
    return system.getBoolean(AppSystemProp.PROJECT_RATE_LIMITER_ENABLED) === true
}

function tenantPoolSetKey(tenantId: string): string {
    return `tenant-quota:concurrency-pool:v1:${tenantId}`
}

function projectConcurrencyKey(projectId: string): string {
    return `project-quota:concurrency:v1:${projectId}`
}

async function getMaxConcurrentJobs({ projectId, log }: { projectId: string, log: FastifyBaseLogger }): Promise<number> {
    const systemLimit = system.getNumberOrThrow(AppSystemProp.DEFAULT_CONCURRENT_JOBS_LIMIT)
    const cached = await distributedStore.get<number>(projectConcurrencyKey(projectId))
    if (!isNil(cached)) {
        return cached
    }
    const { data: project } = await tryCatch(() => projectService(log).getOneOrThrow(projectId))
    const projectQuota = project?.maxConcurrentJobs
    const effective = isNil(projectQuota) ? systemLimit : Math.min(projectQuota, systemLimit)
    await distributedStore.put(projectConcurrencyKey(projectId), effective, PROJECT_CONCURRENCY_TTL_SECONDS)
    return effective
}

async function tryAcquireSlot({ jobId, jobData, log }: { jobId: string, jobData: ExecuteWorkflowJobData, log: FastifyBaseLogger }): Promise<boolean> {
    const maxConcurrentJobs = await getMaxConcurrentJobs({ projectId: jobData.projectId, log })
    return acquireInPool({
        setKey: getConcurrencyPoolSetKey(jobData.projectId),
        member: `${jobData.projectId}:${jobId}`,
        maxJobs: maxConcurrentJobs,
    })
}

async function tryAcquireTenantSlot({ jobId, jobData, maxJobs }: { jobId: string, jobData: ExecuteWorkflowJobData, maxJobs: number }): Promise<boolean> {
    return acquireInPool({
        setKey: tenantPoolSetKey(jobData.tenantId),
        member: `${jobData.projectId}:${jobId}`,
        maxJobs,
    })
}

async function acquireInPool({ setKey, member, maxJobs }: { setKey: string, member: string, maxJobs: number }): Promise<boolean> {
    const workflowTimeoutInMilliseconds = dayjsDuration(system.getNumberOrThrow(AppSystemProp.WORKFLOW_TIMEOUT_SECONDS), 'seconds').add(1, 'minute').asMilliseconds()
    const currentTime = Date.now()
    const redisConnection = await redisConnections.useExisting()

    const result = await redisConnection.eval(
        `
local setKey = KEYS[1]
local currentTime = tonumber(ARGV[1])
local timeoutMs = tonumber(ARGV[2])
local maxJobs = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', setKey, '-inf', currentTime - timeoutMs)

local existingScore = redis.call('ZSCORE', setKey, member)
if existingScore then
    return 0
end

local currentSize = redis.call('ZCARD', setKey)
if currentSize >= maxJobs then
    return 1
end

redis.call('ZADD', setKey, currentTime, member)
redis.call('EXPIRE', setKey, math.ceil(timeoutMs / 1000))

return 0
`,
        1,
        setKey,
        currentTime.toString(),
        workflowTimeoutInMilliseconds.toString(),
        maxJobs.toString(),
        member,
    ) as number

    return result === 0
}

async function releaseSlot({ jobId, jobData }: { jobId: string, jobData: ExecuteWorkflowJobData }): Promise<void> {
    await releaseFromPool({ setKey: getConcurrencyPoolSetKey(jobData.projectId), member: `${jobData.projectId}:${jobId}` })
}

async function releaseTenantSlot({ jobId, jobData }: { jobId: string, jobData: ExecuteWorkflowJobData }): Promise<void> {
    await releaseFromPool({ setKey: tenantPoolSetKey(jobData.tenantId), member: `${jobData.projectId}:${jobId}` })
}

async function releaseFromPool({ setKey, member }: { setKey: string, member: string }): Promise<void> {
    const redisConnection = await redisConnections.useExisting()
    await redisConnection.eval(
        `
local setKey = KEYS[1]
local member = ARGV[1]
redis.call('ZREM', setKey, member)
return 1
`,
        1,
        setKey,
        member,
    )
}

export const rateLimiterInterceptor: JobInterceptor = {
    async preDispatch({ jobId, jobData, job, log }): Promise<InterceptorResult> {
        if (!isLimitableJob(jobData)) {
            return { verdict: InterceptorVerdict.ALLOW }
        }

        const projectLimiterEnabled = isProjectLimiterEnabled()
        const projectAllowed = !projectLimiterEnabled || await tryAcquireSlot({ jobId, jobData, log })
        if (!projectAllowed) {
            return rejectJob({ jobId, jobData, job, log, dimension: 'project' })
        }

        const tenantLimit = await tenantLimitsService(log).getConcurrentExecutionsLimit({ tenantId: jobData.tenantId })
        if (!isNil(tenantLimit)) {
            const tenantAllowed = await tryAcquireTenantSlot({ jobId, jobData, maxJobs: tenantLimit })
            if (!tenantAllowed) {
                if (projectLimiterEnabled) {
                    await releaseSlot({ jobId, jobData })
                }
                return rejectJob({ jobId, jobData, job, log, dimension: 'tenant' })
            }
        }

        log.debug({ job: { id: jobId }, project: { id: jobData.projectId } }, '[rateLimiterInterceptor] Job allowed')
        return { verdict: InterceptorVerdict.ALLOW }
    },

    async onJobFinished({ jobId, jobData, log }): Promise<void> {
        if (!isLimitableJob(jobData)) {
            return
        }
        if (isProjectLimiterEnabled()) {
            await releaseSlot({ jobId, jobData })
        }
        const tenantLimit = await tenantLimitsService(log).getConcurrentExecutionsLimit({ tenantId: jobData.tenantId })
        if (!isNil(tenantLimit)) {
            await releaseTenantSlot({ jobId, jobData })
        }
        log.debug({ job: { id: jobId }, project: { id: jobData.projectId } }, '[rateLimiterInterceptor] Slot released')
    },
}

function rejectJob({ jobId, jobData, job, log, dimension }: RejectJobParams): InterceptorResult {
    const delayInMs = Math.min(600_000, 20_000 * Math.pow(2, job.attemptsMade))
    log.info({ job: { id: jobId }, project: { id: jobData.projectId }, tenant: { id: jobData.tenantId }, dimension, delayInMs }, '[rateLimiterInterceptor] Job rate limited')
    return {
        verdict: InterceptorVerdict.REJECT,
        delayInMs,
        priority: JOB_PRIORITY[RATE_LIMIT_PRIORITY],
    }
}

type RejectJobParams = {
    jobId: string
    jobData: ExecuteWorkflowJobData
    job: Job
    log: FastifyBaseLogger
    dimension: 'project' | 'tenant'
}
