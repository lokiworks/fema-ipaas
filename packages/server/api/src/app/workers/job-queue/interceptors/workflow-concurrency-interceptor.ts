import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { dayjsDuration } from '@fema-ipaas/server-utils'
import { ExecuteWorkflowJobData, JobData, RunEnvironment, WorkerJobType } from '@fema-ipaas/shared'
import { Job } from 'bullmq'
import { FastifyBaseLogger } from 'fastify'
import Redis from 'ioredis'
import { distributedLock, redisConnections } from '../../../database/redis-connections'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { InterceptorResult, InterceptorVerdict, JobInterceptor } from '../job-interceptor'
import { jobQueue } from '../job-queue'
import { ConcurrencyStore, createWorkflowConcurrencyGate, WorkflowConcurrencyGate } from './workflow-concurrency-gate'

export const workflowConcurrencyInterceptor: JobInterceptor = {
    async preDispatch({ jobId, jobData, job, log }): Promise<InterceptorResult> {
        if (!isGated(jobData)) {
            return { verdict: InterceptorVerdict.ALLOW }
        }
        const admitted = await gateFor({ log, job }).admit({ workflowId: jobData.workflowId, jobId, ticket: jobData.concurrency })
        if (admitted) {
            return { verdict: InterceptorVerdict.ALLOW }
        }
        log.debug({ job: { id: jobId }, workflow: { id: jobData.workflowId } }, '[workflowConcurrencyInterceptor] Run waits for a free slot')
        return { verdict: InterceptorVerdict.REJECT, delayInMs: QUEUED_RUN_RECHECK_MS }
    },

    async onJobFinished({ jobId, jobData, log }): Promise<void> {
        if (!isGated(jobData)) {
            return
        }
        await gateFor({ log, job: null }).release({ workflowId: jobData.workflowId, jobId, ticket: jobData.concurrency })
    },
}

export const workflowConcurrencyQueue = {
    async register({ jobId, jobData, log }: { jobId: string, jobData: JobData, log: FastifyBaseLogger }): Promise<void> {
        if (!isGated(jobData)) {
            return
        }
        await gateFor({ log, job: null }).enqueue({ workflowId: jobData.workflowId, jobId, ticket: jobData.concurrency })
    },
}

function isGated(jobData: JobData): jobData is GatedJobData {
    if (jobData.jobType !== WorkerJobType.EXECUTE_WORKFLOW || jobData.environment === RunEnvironment.TESTING) {
        return false
    }
    const ticket = jobData.concurrency
    return !isNil(ticket) && (ticket.maxConcurrentRuns > 0 || !isNil(ticket.orderKey))
}

function gateFor({ log, job }: { log: FastifyBaseLogger, job: Job | null }): WorkflowConcurrencyGate {
    const activeTtlMs = dayjsDuration(system.getNumberOrThrow(AppSystemProp.WORKFLOW_TIMEOUT_SECONDS), 'seconds').add(1, 'minute').asMilliseconds()
    return createWorkflowConcurrencyGate({
        store: redisConcurrencyStore,
        withLock: ({ key, fn }) => distributedLock(log).runExclusive({ key, timeoutInSeconds: LOCK_TIMEOUT_SECONDS, fn }),
        isJobAlive: (jobId) => isJobAlive({ jobId, queueName: job?.queueName, log }),
        now: () => Date.now(),
        activeTtlMs,
    })
}

async function isJobAlive({ jobId, queueName, log }: { jobId: string, queueName: string | undefined, log: FastifyBaseLogger }): Promise<boolean> {
    const queues = [...new Set([queueName, jobQueue(log).getSharedQueue().name].filter((name): name is string => !isNil(name)))]
    for (const name of queues) {
        const { data: queue } = await tryCatch(() => jobQueue(log).getOrCreateQueue({ queueName: name }))
        const found = isNil(queue) ? null : await queue.getJob(jobId)
        if (!isNil(found)) {
            const state = await found.getState()
            return !DEAD_JOB_STATES.includes(state)
        }
    }
    return false
}

async function redis(): Promise<Redis> {
    return redisConnections.useExisting()
}

const redisConcurrencyStore: ConcurrencyStore = {
    async addToQueue({ key, member, score }) {
        const client = await redis()
        await client.zadd(key, 'NX', score, member)
        await client.expire(key, KEY_TTL_SECONDS)
    },
    async queueHead(key) {
        const client = await redis()
        const [head] = await client.zrange(key, 0, 0)
        return head ?? null
    },
    async removeFromQueue({ key, member }) {
        const client = await redis()
        await client.zrem(key, member)
    },
    async pruneActive({ key, before }) {
        const client = await redis()
        await client.zremrangebyscore(key, '-inf', before)
    },
    async isActive({ key, member }) {
        const client = await redis()
        return !isNil(await client.zscore(key, member))
    },
    async activeCount(key) {
        const client = await redis()
        return client.zcard(key)
    },
    async markActive({ key, member, score }) {
        const client = await redis()
        await client.zadd(key, score, member)
        await client.expire(key, KEY_TTL_SECONDS)
    },
    async removeActive({ key, member }) {
        const client = await redis()
        await client.zrem(key, member)
    },
}

const QUEUED_RUN_RECHECK_MS = 3_000
const LOCK_TIMEOUT_SECONDS = 10
const KEY_TTL_SECONDS = 7 * 24 * 60 * 60
const DEAD_JOB_STATES = ['completed', 'failed', 'unknown']

type GatedJobData = ExecuteWorkflowJobData & {
    concurrency: NonNullable<ExecuteWorkflowJobData['concurrency']>
}
