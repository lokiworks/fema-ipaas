import { isNil, tryCatch } from '@fema/core-utils'
import { apDayjsDuration } from '@fema/server-utils'
import { ExecuteFlowJobData, JOB_PRIORITY, JobData, RATE_LIMIT_PRIORITY, RunEnvironment, WorkerJobType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { getConcurrencyPoolSetKey } from '../../../database/redis/keys'
import { distributedStore, redisConnections } from '../../../database/redis-connections'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { workspaceService } from '../../../workspace/workspace-service'
import { InterceptorResult, InterceptorVerdict, JobInterceptor } from '../job-interceptor'

const RATE_LIMIT_WORKER_JOB_TYPES = [WorkerJobType.EXECUTE_FLOW]
const WORKSPACE_CONCURRENCY_TTL_SECONDS = 60

function shouldContinue(jobData: JobData): jobData is ExecuteFlowJobData {
    if (!system.getBoolean(AppSystemProp.WORKSPACE_RATE_LIMITER_ENABLED)) {
        return false
    }
    if (!RATE_LIMIT_WORKER_JOB_TYPES.includes(jobData.jobType)) {
        return false
    }
    const castedJob = jobData as ExecuteFlowJobData
    if (castedJob.environment === RunEnvironment.TESTING) {
        return false
    }
    return true
}

function workspaceConcurrencyKey(workspaceId: string): string {
    return `workspace-quota:concurrency:v1:${workspaceId}`
}

async function getMaxConcurrentJobs({ workspaceId, log }: { workspaceId: string, log: FastifyBaseLogger }): Promise<number> {
    const systemLimit = system.getNumberOrThrow(AppSystemProp.DEFAULT_CONCURRENT_JOBS_LIMIT)
    const cached = await distributedStore.get<number>(workspaceConcurrencyKey(workspaceId))
    if (!isNil(cached)) {
        return cached
    }
    const { data: workspace } = await tryCatch(() => workspaceService(log).getOneOrThrow(workspaceId))
    const workspaceQuota = workspace?.maxConcurrentJobs
    const effective = isNil(workspaceQuota) ? systemLimit : Math.min(workspaceQuota, systemLimit)
    await distributedStore.put(workspaceConcurrencyKey(workspaceId), effective, WORKSPACE_CONCURRENCY_TTL_SECONDS)
    return effective
}

async function tryAcquireSlot({ jobId, jobData, log }: { jobId: string, jobData: ExecuteFlowJobData, log: FastifyBaseLogger }): Promise<boolean> {
    const flowTimeoutInMilliseconds = apDayjsDuration(system.getNumberOrThrow(AppSystemProp.FLOW_TIMEOUT_SECONDS), 'seconds').add(1, 'minute').asMilliseconds()
    const maxConcurrentJobs = await getMaxConcurrentJobs({ workspaceId: jobData.workspaceId, log })
    const setKey = getConcurrencyPoolSetKey(jobData.workspaceId)
    const currentTime = Date.now()
    const member = `${jobData.workspaceId}:${jobId}`
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
        flowTimeoutInMilliseconds.toString(),
        maxConcurrentJobs.toString(),
        member,
    ) as number

    return result === 0
}

async function releaseSlot({ jobId, jobData }: { jobId: string, jobData: ExecuteFlowJobData }): Promise<void> {
    const setKey = getConcurrencyPoolSetKey(jobData.workspaceId)
    const member = `${jobData.workspaceId}:${jobId}`
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
        if (!shouldContinue(jobData)) {
            return { verdict: InterceptorVerdict.ALLOW }
        }

        const allowed = await tryAcquireSlot({ jobId, jobData, log })
        if (allowed) {
            log.debug({ job: { id: jobId }, workspace: { id: jobData.workspaceId } }, '[rateLimiterInterceptor] Job allowed')
            return { verdict: InterceptorVerdict.ALLOW }
        }

        const delayInMs = Math.min(600_000, 20_000 * Math.pow(2, job.attemptsMade))
        log.info({ job: { id: jobId }, workspace: { id: jobData.workspaceId }, delayInMs }, '[rateLimiterInterceptor] Job rate limited')
        return {
            verdict: InterceptorVerdict.REJECT,
            delayInMs,
            priority: JOB_PRIORITY[RATE_LIMIT_PRIORITY],
        }
    },

    async onJobFinished({ jobId, jobData, log }): Promise<void> {
        if (!shouldContinue(jobData)) {
            return
        }
        await releaseSlot({ jobId, jobData })
        log.debug({ job: { id: jobId }, workspace: { id: jobData.workspaceId } }, '[rateLimiterInterceptor] Slot released')
    },
}
