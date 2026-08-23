import { ApId, isNil, tryCatch } from '@fema/core-utils'
import { apDayjsDuration, memoryLock } from '@fema/server-utils'
import { ExecuteWorkflowJobData, getDefaultJobPriority, JOB_PRIORITY, JobData, PollingJobData, RenewWebhookJobData, ScheduleOptions, TriggerSourceScheduleType, UserInteractionJobData, WebhookJobData, WorkerJobType } from '@fema/shared'
import { Job, Queue } from 'bullmq'
import { FastifyBaseLogger } from 'fastify'
import { redisConnections } from '../../database/redis-connections'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { workspaceWorkerGroupService } from '../../workspace/workspace-worker-group.service'
import { getWorkspaceGroupQueueName, QueueName } from '../job'
import { workerCapacity } from '../machine/worker-capacity'

const EIGHT_MINUTES_IN_MILLISECONDS = apDayjsDuration(8, 'minute').asMilliseconds()
const REDIS_FAILED_JOB_RETENTION_DAYS = apDayjsDuration(system.getNumberOrThrow(AppSystemProp.REDIS_FAILED_JOB_RETENTION_DAYS), 'day').asSeconds()
const REDIS_FAILED_JOB_RETRY_COUNT = system.getNumberOrThrow(AppSystemProp.REDIS_FAILED_JOB_RETENTION_MAX_COUNT)

const dedicatedWorkersQueues = new Map<string, Queue>()

export const jobQueue = (log: FastifyBaseLogger) => ({
    async init(): Promise<void> {
        await ensureQueueExists({ log, queueName: QueueName.WORKER_JOBS })
        log.info('[jobQueue#init] Dynamic queue system initialized')
    },
    async add(params: AddJobParams<JobType>): Promise<Job | null> {
        const { type, data } = params

        const tenantId = data.tenantId
        const workspaceId = 'workspaceId' in data ? data.workspaceId : null
        const queueName = await getQueueName({ tenantId, workspaceId, jobType: data.jobType }, log)
        const queue = await ensureQueueExists({ log, queueName })

        switch (type) {
            case JobType.REPEATING: {
                const { scheduleOptions } = params
                await queue.upsertJobScheduler(data.workflowVersionId, scheduleOptions.type === TriggerSourceScheduleType.INTERVAL ? {
                    every: scheduleOptions.intervalMs,
                    startDate: Date.now() + scheduleOptions.intervalMs,
                } : {
                    pattern: scheduleOptions.cronExpression,
                    tz: scheduleOptions.timezone,
                }, {
                    name: data.workflowVersionId,
                    data,
                    opts: {
                        priority: JOB_PRIORITY[getDefaultJobPriority(data)],
                    },
                })
                return null
            }
            case JobType.ONE_TIME: {
                return queue.add(params.id, data, {
                    priority: JOB_PRIORITY[getDefaultJobPriority(data)],
                    delay: params.delay,
                    jobId: params.id,
                    ...isUserInteractionJob(data.jobType) ? {
                        attempts: 1,
                        removeOnComplete: { age: 300 },
                        removeOnFail: true,
                    } : {},
                })
            }
        }
    },

    async removeRepeatingJob({ workflowVersionId }: { workflowVersionId: ApId }): Promise<void> {
        const allQueues = [...dedicatedWorkersQueues.values()].filter(queue => !isNil(queue))

        await Promise.allSettled(
            allQueues.map(queue => queue.removeJobScheduler(workflowVersionId)),
        )

        log.info({
            workflowVersion: { id: workflowVersionId },
        }, '[jobQueue#removeRepeatingJob] removed jobs from all queues')
    },

    async removeOneTimeJob({ jobId, tenantId, workspaceId, jobType }: RemoveOneTimeJobParams): Promise<void> {
        const queueName = await getQueueName({ tenantId, workspaceId, jobType }, log)
        const queue = await ensureQueueExists({ log, queueName })
        const job = await queue.getJob(jobId)
        if (!isNil(job)) {
            await job.remove()
            log.info({
                job: { id: jobId },
                queueName,
            }, '[jobQueue#removeOneTimeJob] removed job from queue')
            return
        }
        log.info({
            job: { id: jobId },
            queueName,
        }, '[jobQueue#removeOneTimeJob] job not found in queue')
    },

    async cancelAndReportNeverStarted({ jobId, tenantId, workspaceId, jobType }: RemoveOneTimeJobParams): Promise<boolean> {
        const queueName = await getQueueName({ tenantId, workspaceId, jobType }, log)
        const queue = await ensureQueueExists({ log, queueName })
        const job = await queue.getJob(jobId)
        if (isNil(job)) {
            log.info({ job: { id: jobId }, queueName }, '[jobQueue#cancelAndReportNeverStarted] job not found')
            return false
        }
        const everDequeued = !isNil(job.processedOn)
        const { error } = await tryCatch(() => job.remove())
        if (error) {
            log.info({ job: { id: jobId, everDequeued }, queueName, error: String(error) }, '[jobQueue#cancelAndReportNeverStarted] a worker holds the job')
            return false
        }
        log.info({ job: { id: jobId, everDequeued }, queueName }, '[jobQueue#cancelAndReportNeverStarted] removed the abandoned job')
        return !everDequeued
    },

    async getOrCreateQueue({ queueName }: { queueName: string }): Promise<Queue> {
        return ensureQueueExists({ log, queueName })
    },

    getAllQueues(): Queue[] {
        const queues = [...dedicatedWorkersQueues.values()].filter(queue => !isNil(queue))
        return queues
    },

    getSharedQueue(): Queue {
        const queue = dedicatedWorkersQueues.get(QueueName.WORKER_JOBS)
        if (isNil(queue)) {
            throw Error('Shared queue not initialized')
        }
        return queue
    },
    async removeAllExecutionJobs({ executionId, tenantId, workspaceId }: RemoveAllExecutionJobsParams): Promise<void> {
        const queueName = await getQueueName({ tenantId, workspaceId, jobType: WorkerJobType.EXECUTE_WORKFLOW }, log)
        const queue = await ensureQueueExists({ log, queueName })
        const allJobs = await queue.getJobs(['waiting', 'delayed'])
        const matching = allJobs.filter((j) => j.id?.startsWith(executionId))
        await Promise.allSettled(matching.map((j) => j.remove()))
        log.info({ execution: { id: executionId }, queueName, removedIds: matching.map((j) => j.id) }, '[jobQueue#removeAllExecutionJobs] done')
    },

    async close(): Promise<void> {
        log.info('[jobQueue#close] Closing job queue')
        const allQueues = [...dedicatedWorkersQueues.values()].filter(queue => !isNil(queue))
        await Promise.allSettled(
            allQueues.map(queue => queue.close()),
        )
    },
})

async function ensureQueueExists({ log, queueName }: { log: FastifyBaseLogger, queueName: string }): Promise<Queue> {
    const existingQueue = dedicatedWorkersQueues.get(queueName)
    if (!isNil(existingQueue)) {
        return existingQueue
    }
    return memoryLock.runExclusive({
        key: `ensure_queue_exists_${queueName}`,
        fn: async () => {
            const existingQueue = dedicatedWorkersQueues.get(queueName)
            if (!isNil(existingQueue)) {
                return existingQueue
            }

            const queue = new Queue(queueName, {
                connection: await redisConnections.create(),
                defaultJobOptions: {
                    attempts: 2,
                    backoff: {
                        type: 'exponential',
                        delay: EIGHT_MINUTES_IN_MILLISECONDS,
                    },
                    removeOnComplete: true,
                    removeOnFail: {
                        age: REDIS_FAILED_JOB_RETENTION_DAYS,
                        count: REDIS_FAILED_JOB_RETRY_COUNT,
                    },
                },
            })

            await queue.removeGlobalConcurrency()
            await queue.waitUntilReady()

            dedicatedWorkersQueues.set(queueName, queue)

            log.info({
                queueName,
            }, '[jobQueue#ensureQueueExists] Queue created')
            return queue
        },
    })
}

const USER_INTERACTION_JOB_TYPES = new Set([
    WorkerJobType.EXECUTE_PROPERTY,
    WorkerJobType.EXECUTE_VALIDATION,
    WorkerJobType.EXECUTE_RESOLVE_CONNECTION_IDENTIFIER,
    WorkerJobType.EXECUTE_TRIGGER_HOOK,
    WorkerJobType.EXECUTE_EXTRACT_CONNECTOR_INFORMATION,
    WorkerJobType.EXECUTE_TOKEN_REFRESH,
    WorkerJobType.EXECUTE_ACTION,
])

export function isUserInteractionJob(jobType: WorkerJobType): boolean {
    return USER_INTERACTION_JOB_TYPES.has(jobType)
}

export function isUserInteractionJobData(jobData: JobData): jobData is UserInteractionJobData {
    return USER_INTERACTION_JOB_TYPES.has(jobData.jobType)
}

const WORKSPACE_GROUP_ROUTABLE_JOB_TYPES = new Set<WorkerJobType>([
    WorkerJobType.EXECUTE_WORKFLOW,
    WorkerJobType.EXECUTE_WEBHOOK,
])

async function getQueueName({ tenantId, workspaceId, jobType }: GetQueueNameParams, log: FastifyBaseLogger): Promise<string> {
    if (!isNil(tenantId) && !isNil(workspaceId) && !isNil(jobType) && WORKSPACE_GROUP_ROUTABLE_JOB_TYPES.has(jobType)) {
        const workspaceGroupId = await workspaceWorkerGroupService(log).getWorkspaceWorkerGroup({ workspaceId, tenantId })
        if (!isNil(workspaceGroupId)) {
            // Only route to the group's dedicated queue while it has a live worker; otherwise fall
            // through to the shared queue so runs still execute until a worker returns.
            const { workspaceGroups } = await workerCapacity.get()
            const capacity = workspaceGroups.get(workspaceGroupId)
            if (!isNil(capacity) && capacity.online > 0) {
                return getWorkspaceGroupQueueName(workspaceGroupId)
            }
        }
    }
    return QueueName.WORKER_JOBS
}


export enum JobType {
    REPEATING = 'repeating',
    ONE_TIME = 'one_time',
}

type GetQueueNameParams = {
    tenantId: string | null
    workspaceId?: string | null
    jobType?: WorkerJobType
}

type RemoveOneTimeJobParams = {
    jobId: ApId
    tenantId: string | null
    workspaceId?: string | null
    jobType?: WorkerJobType
}

type RemoveAllExecutionJobsParams = {
    executionId: string
    tenantId: string | null
    workspaceId?: string | null
}

type BaseAddParams<JD extends Omit<JobData, 'engineToken'>, JT extends JobType> = {
    id: ApId
    data: JD
    type: JT
    delay?: number
}
type RepeatingJobAddParams = BaseAddParams<PollingJobData | RenewWebhookJobData, JobType.REPEATING> & {
    scheduleOptions: ScheduleOptions
}
type OneTimeJobAddParams = BaseAddParams<ExecuteWorkflowJobData | WebhookJobData | UserInteractionJobData, JobType.ONE_TIME>

export type AddJobParams<type extends JobType> = type extends JobType.REPEATING ? RepeatingJobAddParams : OneTimeJobAddParams
