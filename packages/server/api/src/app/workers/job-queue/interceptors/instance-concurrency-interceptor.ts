import { tryCatch } from '@fema-ipaas/core-utils'
import { dayjsDuration } from '@fema-ipaas/server-utils'
import { ExecuteWorkflowJobData, InstanceLimitKey, JobData, RunEnvironment, WorkerJobType } from '@fema-ipaas/shared'
import { redisConnections } from '../../../database/redis-connections'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { instanceLimits } from '../../../limits/instance-limits'
import { InterceptorResult, InterceptorVerdict, JobInterceptor } from '../job-interceptor'

export const instanceConcurrencyInterceptor: JobInterceptor = {
    async preDispatch({ jobId, jobData, job, log }): Promise<InterceptorResult> {
        if (!isCounted(jobData) || !instanceLimits.isExplicit(InstanceLimitKey.CONCURRENT_RUNS)) {
            return { verdict: InterceptorVerdict.ALLOW }
        }
        const { data: allowed, error } = await tryCatch(() => tryAcquire({ jobId, limit: instanceLimits.concurrentRuns() }))
        if (error) {
            log.warn({ job: { id: jobId }, error: String(error) }, '[instanceConcurrencyInterceptor] Could not check the instance concurrency limit, allowing the run')
            return { verdict: InterceptorVerdict.ALLOW }
        }
        if (allowed) {
            return { verdict: InterceptorVerdict.ALLOW }
        }
        const delayInMs = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, Math.min(job.attemptsMade, 5)))
        log.info({ job: { id: jobId }, delayInMs }, '[instanceConcurrencyInterceptor] Instance concurrency limit reached, run waits')
        return { verdict: InterceptorVerdict.REJECT, delayInMs }
    },

    async onJobFinished({ jobId, jobData }): Promise<void> {
        if (!isCounted(jobData)) {
            return
        }
        const redis = await redisConnections.useExisting()
        await redis.zrem(ACTIVE_RUNS_KEY, jobId)
    },
}

export const instanceConcurrency = {
    async currentlyRunning(): Promise<number | null> {
        const { data, error } = await tryCatch(async () => {
            const redis = await redisConnections.useExisting()
            await redis.zremrangebyscore(ACTIVE_RUNS_KEY, '-inf', Date.now() - activeTtlMs())
            return redis.zcard(ACTIVE_RUNS_KEY)
        })
        return error ? null : data
    },
}

function isCounted(jobData: JobData): jobData is ExecuteWorkflowJobData {
    return jobData.jobType === WorkerJobType.EXECUTE_WORKFLOW && jobData.environment !== RunEnvironment.TESTING
}

async function tryAcquire({ jobId, limit }: { jobId: string, limit: number }): Promise<boolean> {
    const redis = await redisConnections.useExisting()
    const result = await redis.eval(
        ACQUIRE_SCRIPT,
        1,
        ACTIVE_RUNS_KEY,
        Date.now().toString(),
        activeTtlMs().toString(),
        limit.toString(),
        jobId,
    )
    return Number(result) === 0
}

function activeTtlMs(): number {
    return dayjsDuration(system.getNumberOrThrow(AppSystemProp.WORKFLOW_TIMEOUT_SECONDS), 'seconds').add(1, 'minute').asMilliseconds()
}

const ACTIVE_RUNS_KEY = 'instance-concurrency:v1:active-runs'
const BASE_DELAY_MS = 5_000
const MAX_DELAY_MS = 60_000
const ACQUIRE_SCRIPT = `
local setKey = KEYS[1]
local currentTime = tonumber(ARGV[1])
local timeoutMs = tonumber(ARGV[2])
local maxRuns = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', setKey, '-inf', currentTime - timeoutMs)

if redis.call('ZSCORE', setKey, member) then
    return 0
end

if redis.call('ZCARD', setKey) >= maxRuns then
    return 1
end

redis.call('ZADD', setKey, currentTime, member)
redis.call('PEXPIRE', setKey, timeoutMs)
return 0
`
