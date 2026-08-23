import { isNil } from '@fema/core-utils'
import { Queue } from 'bullmq'
import { FastifyBaseLogger } from 'fastify'
import { jobQueue } from './job-queue/job-queue'

export const tenantQueueMigrationService = (log: FastifyBaseLogger) => ({
    async migrateJobs({ fromQueueName, toQueueName, tenantId, batchSize = 200 }: MigrateJobsParams): Promise<void> {
        if (fromQueueName === toQueueName) {
            return
        }
        const sourceQueue = await jobQueue(log).getOrCreateQueue({ queueName: fromQueueName })
        const targetQueue = await jobQueue(log).getOrCreateQueue({ queueName: toQueueName })

        await migrateRegularJobs({ sourceQueue, targetQueue, tenantId, batchSize })
        await migrateSchedulers({ sourceQueue, targetQueue, tenantId, batchSize, log })
    },
})

async function migrateRegularJobs({ sourceQueue, targetQueue, tenantId, batchSize }: MigrateQueueParams): Promise<void> {
    for (const state of ['waiting', 'delayed', 'paused'] as const) {
        let offset = 0
        while (true) {
            const jobs = await sourceQueue.getJobs([state], offset, offset + batchSize - 1)
            if (jobs.length === 0) {
                break
            }

            const tenantJobs = jobs.filter(job => job.data?.tenantId === tenantId && !job.repeatJobKey)
            const skipped = jobs.length - tenantJobs.length

            await Promise.all(tenantJobs.map(async (job) => {
                if (isNil(job.id)) {
                    return
                }
                const remainingDelay = isNil(job.opts.delay) ? undefined : Math.max(0, job.timestamp + (job.opts.delay ?? 0) - Date.now())
                await targetQueue.add(job.name, job.data, {
                    jobId: job.id,
                    priority: job.opts.priority,
                    delay: remainingDelay,
                    attempts: job.opts.attempts,
                    backoff: job.opts.backoff,
                    removeOnComplete: job.opts.removeOnComplete,
                    removeOnFail: job.opts.removeOnFail,
                })
                await job.remove()
            }))

            // Only advance by skipped count — removed jobs collapse the indices
            offset += skipped
            if (jobs.length < batchSize) {
                break
            }
        }
    }
}

async function migrateSchedulers({ sourceQueue, targetQueue, tenantId, batchSize, log }: MigrateQueueParams & { log: FastifyBaseLogger }): Promise<void> {
    let offset = 0
    const migratedSchedulerIds: string[] = []
    let migrationFailed = false

    while (true) {
        const schedulers = await sourceQueue.getJobSchedulers(offset, offset + batchSize - 1)
        if (schedulers.length === 0) {
            break
        }
        const tenantSchedulers = schedulers.filter(s => s.template?.data?.tenantId === tenantId)
        const skipped = schedulers.length - tenantSchedulers.length

        for (const scheduler of tenantSchedulers) {
            const schedulerId = scheduler.id ?? scheduler.key
            await targetQueue.upsertJobScheduler(
                schedulerId,
                {
                    pattern: scheduler.pattern,
                    every: scheduler.every,
                    tz: scheduler.tz,
                    ...isNil(scheduler.every) ? {} : { startDate: Date.now() + Number(scheduler.every) },
                },
                {
                    name: scheduler.name,
                    data: scheduler.template?.data,
                    opts: scheduler.template?.opts,
                },
            ).then(async (data) => {
                if (!isNil(data)) { // to make sure job is not removed unless it is upserted in target queue
                    log.info({
                        tenant: { id: tenantId },
                        schedulerId,
                        batch: `${offset}-${offset + batchSize - 1}`,
                    }, '[tenantQueueMigrationService#migrateSchedulers] Migrated scheduler to new queue')
                    migratedSchedulerIds.push(schedulerId)
                    await sourceQueue.removeJobScheduler(schedulerId)
                }
                else {
                    log.error({
                        tenant: { id: tenantId },
                        schedulerId,
                        batch: `${offset}-${offset + batchSize - 1}`,
                    }, '[tenantQueueMigrationService#migrateSchedulers] Failed to migrate scheduler to new queue')
                    migrationFailed = true
                }
            })
            
        }

        offset += skipped
        if (schedulers.length < batchSize) {
            break
        }
    }

    if (!migrationFailed) {
        await removeOrphanedDelayedJobs({ sourceQueue, schedulerIds: migratedSchedulerIds, batchSize })
        log.info({
            tenant: { id: tenantId },
            migratedSchedulers: migratedSchedulerIds.length,
        }, '[tenantQueueMigrationService#migrateSchedulers] Migrated schedulers to new queue')
        return
    }

    log.error({
        tenant: { id: tenantId },
        migratedSchedulers: migratedSchedulerIds.length,
    }, '[tenantQueueMigrationService#migrateSchedulers] Some batches failed to migrate schedulers, delayed orphaned jobs not deleted')
}

// removeJobScheduler does not remove the already-queued next-run delayed job.
// Scan delayed jobs and remove any whose repeatJobKey belongs to a migrated scheduler.
async function removeOrphanedDelayedJobs({ sourceQueue, schedulerIds, batchSize }: { sourceQueue: Queue, schedulerIds: string[], batchSize: number }): Promise<void> {
    if (schedulerIds.length === 0) {
        return
    }
    let offset = 0
    while (true) {
        const jobs = await sourceQueue.getJobs(['delayed'], offset, offset + batchSize - 1)
        if (jobs.length === 0) {
            break
        }
        let skipped = 0
        await Promise.all(jobs.map(async (job) => {
            const isOrphaned = schedulerIds.some(id => job.repeatJobKey?.startsWith(id))
            if (isOrphaned) {
                await job.remove()
            }
            else {
                skipped++
            }
        }))
        offset += skipped
        if (jobs.length < batchSize) {
            break
        }
    }
}

type MigrateJobsParams = {
    fromQueueName: string
    toQueueName: string
    tenantId: string
    batchSize?: number
}

type MigrateQueueParams = {
    sourceQueue: Queue
    targetQueue: Queue
    tenantId: string
    batchSize: number
}
