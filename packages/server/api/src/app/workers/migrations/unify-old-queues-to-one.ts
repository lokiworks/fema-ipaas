import { isNil } from '@fema/core-utils'
import { BeginExecuteWorkflowJobData, ExecuteWorkflowJobData, LATEST_JOB_DATA_SCHEMA_VERSION, StreamStepProgress, WebhookJobData, WorkerJobType } from '@fema/shared'
import { Job, Queue } from 'bullmq'
import { FastifyBaseLogger } from 'fastify'
import { redisConnections } from '../../database/redis-connections'
import { workflowVersionRepo } from '../../workflows/workflow-version/workflow-version.service'
import { workspaceService } from '../../workspace/workspace-service'
import { jobQueue, JobType } from '../job-queue/job-queue'

type LegacyOneTimeJobData = Pick<BeginExecuteWorkflowJobData, 'runId' | 'workspaceId' | 'workflowVersionId' | 'environment' | 'workerHandlerId' | 'httpRequestId' | 'payload' | 'executeTrigger' | 'executionType' | 'stepNameToTest' | 'sampleData'> & { progressUpdateType: string }
type LegacyWebhookJobData = Pick<WebhookJobData, 'workspaceId' | 'schemaVersion' | 'requestId' | 'payload' | 'runEnvironment' | 'workflowId' | 'saveSampleData' | 'workflowVersionIdToRun' | 'execute' | 'parentRunId' | 'failParentOnFailure'>
const migratedKey = 'unified_queue_migrated'

export const unifyOldQueuesIntoOne = (log: FastifyBaseLogger) => ({
    async run(): Promise<void> {
        if (await isMigrated()) {
            log.info('[unifyOldQueuesIntoOne] Already migrated, skipping')
            return
        }

        const oneTimeJobsHadZero = await migrateOneTimeJobs(log)
        const webhookJobsHadZero = await migrateWebhookJobs(log)
     
        await cleanQueue('usersInteractionJobs')
        await cleanQueue('agentsJobs')
        await cleanQueue('cleanupJobs')
        await cleanQueue('repeatableJobs')

        if (oneTimeJobsHadZero && webhookJobsHadZero) {
            await markAsMigrated()
            log.info('[unifyOldQueuesIntoOne] Migration completed and marked as done')
        }
    },
})

async function isMigrated(): Promise<boolean> {
    const redisConnectionInstance = await redisConnections.useExisting()
    const migrated = await redisConnectionInstance.get(migratedKey)
    return migrated === 'true'
}

async function markAsMigrated(): Promise<void> {
    const redisConnectionInstance = await redisConnections.useExisting()
    await redisConnectionInstance.set(migratedKey, 'true')
}

async function migrateOneTimeJobs(log: FastifyBaseLogger): Promise<boolean> {
    let migratedOneTimeJobs = 0
    const hadZero = await migrateQueue<LegacyOneTimeJobData>('oneTimeJobs', async (job) => {
        const casedData = job.data
        migratedOneTimeJobs++
        if (migratedOneTimeJobs % 500 === 0) {
            log.info({
                migratedOneTimeJobs,
            }, '[unifyOldQueuesIntoOne] Migrated one time jobs')
        }
        const workflowVersion = await workflowVersionRepo().findOne({
            where: {
                id: casedData.workflowVersionId,
            },
            select: {
                workflowId: true,
            },
        })
        if (!isNil(workflowVersion?.workflowId)) {
            const { progressUpdateType: legacyProgressUpdateType, ...restCasedData } = casedData
            await jobQueue(log).add({
                id: job.id!,
                type: JobType.ONE_TIME,
                data: {
                    ...restCasedData,
                    streamStepProgress: legacyProgressUpdateType === 'TEST_WORKFLOW' ? StreamStepProgress.WEBSOCKET : StreamStepProgress.NONE,
                    workflowId: workflowVersion.workflowId,
                    tenantId: await workspaceService(log).getTenantId(casedData.workspaceId),
                    schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                    jobType: WorkerJobType.EXECUTE_WORKFLOW,
                } as ExecuteWorkflowJobData,
            })
        }
        await job.remove()
    })
    if (migratedOneTimeJobs > 0) {
        log.info({
            migratedOneTimeJobs,
        }, '[unifyOldQueuesIntoOne] Migrated one time jobs')
    }
    return hadZero
}

async function migrateWebhookJobs(log: FastifyBaseLogger): Promise<boolean> {
    let migratedWebhookJobs = 0
    const hadZero = await migrateQueue<LegacyWebhookJobData>('webhookJobs', async (job) => {
        const casedData = job.data
        migratedWebhookJobs++
        if (migratedWebhookJobs % 500 === 0) {
            log.info({
                migratedWebhookJobs,
            }, '[unifyOldQueuesIntoOne] Migrated webhook jobs')
        }
        await jobQueue(log).add({
            id: job.id!,
            type: JobType.ONE_TIME,
            data: {
                ...casedData,
                tenantId: await workspaceService(log).getTenantId(casedData.workspaceId),
                jobType: WorkerJobType.EXECUTE_WEBHOOK,
            },
        })
        await job.remove()
    })
    if (migratedWebhookJobs > 0) {
        log.info({
            migratedWebhookJobs,
        }, '[unifyOldQueuesIntoOne] Migrated webhook jobs')
    }
    return hadZero
}

async function migrateQueue<T>(name: string, migrationFn: (job: Job<T>) => Promise<void>): Promise<boolean> {
    const legacyQueue = new Queue<T>(name, {
        connection: await redisConnections.create(),
    })

    const waitingJobs = await legacyQueue.getJobs(['waiting', 'delayed', 'active', 'prioritized'])
    const batchSize = 200
    for (let i = 0; i < waitingJobs.length; i += batchSize) {
        const batch = waitingJobs.slice(i, i + batchSize)
        await Promise.all(batch.map(job => migrationFn(job)))
    }
    await legacyQueue.close()
    return waitingJobs.length === 0
}

async function cleanQueue(name: string) {
    const queue = new Queue(name, {
        connection: await redisConnections.create(),
    })
    await queue.obliterate({
        force: true,
    })
}
