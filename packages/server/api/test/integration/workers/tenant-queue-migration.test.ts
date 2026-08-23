import { apId } from '@fema/core-utils'
import { WorkflowTriggerType, LATEST_JOB_DATA_SCHEMA_VERSION, WorkerJobType } from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { getTenantGroupQueueName } from '../../../../src/app/workers/job'
import { jobQueue } from '../../../../src/app/workers/job-queue/job-queue'
import { tenantQueueMigrationService } from '../../../../src/app/workers/tenant-queue-migration.service'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('tenantQueueMigrationService', () => {
    let fromQueueName: string
    let toQueueName: string

    beforeEach(() => {
        fromQueueName = getTenantGroupQueueName(apId())
        toQueueName = getTenantGroupQueueName(apId())
    })

    afterEach(async () => {
        const fromQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: fromQueueName })
        const toQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: toQueueName })
        await fromQueue.obliterate({ force: true })
        await toQueue.obliterate({ force: true })
    })

    it('returns early without touching queues when fromQueueName equals toQueueName', async () => {
        const tenantId = apId()
        const workflowVersionId = apId()
        const sameQueue = getTenantGroupQueueName(apId())
        const queue = await jobQueue(app.log).getOrCreateQueue({ queueName: sameQueue })

        await queue.upsertJobScheduler(
            workflowVersionId,
            { pattern: '*/5 * * * *', tz: 'UTC' },
            { name: workflowVersionId, data: buildPollingJobData({ tenantId, workflowVersionId }) },
        )

        await tenantQueueMigrationService(app.log).migrateJobs({
            fromQueueName: sameQueue,
            toQueueName: sameQueue,
            tenantId,
        })

        expect(await queue.getJobSchedulersCount()).toBe(1)
        await queue.obliterate({ force: true })
    })

    it('moves a POLLING scheduler from source queue to target queue', async () => {
        const tenantId = apId()
        const workflowVersionId = apId()
        const fromQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: fromQueueName })
        const toQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: toQueueName })

        await fromQueue.upsertJobScheduler(
            workflowVersionId,
            { pattern: '*/5 * * * *', tz: 'UTC' },
            { name: workflowVersionId, data: buildPollingJobData({ tenantId, workflowVersionId }) },
        )

        await tenantQueueMigrationService(app.log).migrateJobs({ fromQueueName, toQueueName, tenantId })

        expect(await fromQueue.getJobSchedulersCount()).toBe(0)
        expect(await toQueue.getJobSchedulersCount()).toBe(1)

        const [movedScheduler] = await toQueue.getJobSchedulers(0, 0)
        expect(movedScheduler.id ?? movedScheduler.key).toBe(workflowVersionId)
        expect(movedScheduler.template?.data?.tenantId).toBe(tenantId)
        expect(movedScheduler.pattern).toBe('*/5 * * * *')
    })

    it('does not migrate schedulers belonging to a different tenant', async () => {
        const tenantA = apId()
        const tenantB = apId()
        const workflowVersionA = apId()
        const workflowVersionB = apId()
        const fromQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: fromQueueName })
        const toQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: toQueueName })

        await fromQueue.upsertJobScheduler(
            workflowVersionA,
            { pattern: '*/5 * * * *', tz: 'UTC' },
            { name: workflowVersionA, data: buildPollingJobData({ tenantId: tenantA, workflowVersionId: workflowVersionA }) },
        )
        await fromQueue.upsertJobScheduler(
            workflowVersionB,
            { pattern: '*/10 * * * *', tz: 'UTC' },
            { name: workflowVersionB, data: buildPollingJobData({ tenantId: tenantB, workflowVersionId: workflowVersionB }) },
        )

        await tenantQueueMigrationService(app.log).migrateJobs({ fromQueueName, toQueueName, tenantId: tenantA })

        expect(await fromQueue.getJobSchedulersCount()).toBe(1)
        expect(await toQueue.getJobSchedulersCount()).toBe(1)

        const [remaining] = await fromQueue.getJobSchedulers(0, 0)
        expect(remaining.template?.data?.tenantId).toBe(tenantB)

        const [moved] = await toQueue.getJobSchedulers(0, 0)
        expect(moved.template?.data?.tenantId).toBe(tenantA)
    })

    it('removes the orphaned next-run delayed job from the source queue after scheduler migration', async () => {
        const tenantId = apId()
        const workflowVersionId = apId()
        const fromQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: fromQueueName })
        const toQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: toQueueName })

        await fromQueue.upsertJobScheduler(
            workflowVersionId,
            { pattern: '*/5 * * * *', tz: 'UTC' },
            { name: workflowVersionId, data: buildPollingJobData({ tenantId, workflowVersionId }) },
        )
        // upsertJobScheduler always queues the next-run delayed instance immediately
        expect(await fromQueue.getDelayedCount()).toBe(1)

        await tenantQueueMigrationService(app.log).migrateJobs({ fromQueueName, toQueueName, tenantId })

        expect(await fromQueue.getDelayedCount()).toBe(0)
        // Target queue has the scheduler and its own next-run delayed job
        expect(await toQueue.getDelayedCount()).toBe(1)
    })

    it('does not remove delayed jobs belonging to other-tenant schedulers on the source queue', async () => {
        const tenantA = apId()
        const tenantB = apId()
        const workflowVersionA = apId()
        const workflowVersionB = apId()
        const fromQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: fromQueueName })

        await fromQueue.upsertJobScheduler(
            workflowVersionA,
            { pattern: '*/5 * * * *', tz: 'UTC' },
            { name: workflowVersionA, data: buildPollingJobData({ tenantId: tenantA, workflowVersionId: workflowVersionA }) },
        )
        await fromQueue.upsertJobScheduler(
            workflowVersionB,
            { pattern: '*/10 * * * *', tz: 'UTC' },
            { name: workflowVersionB, data: buildPollingJobData({ tenantId: tenantB, workflowVersionId: workflowVersionB }) },
        )
        expect(await fromQueue.getDelayedCount()).toBe(2)

        await tenantQueueMigrationService(app.log).migrateJobs({ fromQueueName, toQueueName, tenantId: tenantA })

        // Only tenantA's orphaned delayed job should be removed
        expect(await fromQueue.getDelayedCount()).toBe(1)
    })

    it('moves regular (one-time) waiting jobs for the tenant', async () => {
        const tenantId = apId()
        const jobId = apId()
        const fromQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: fromQueueName })
        const toQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: toQueueName })

        await fromQueue.add(jobId, buildPollingJobData({ tenantId, workflowVersionId: apId() }), { jobId })

        await tenantQueueMigrationService(app.log).migrateJobs({ fromQueueName, toQueueName, tenantId })

        expect(await fromQueue.getWaitingCount()).toBe(0)
        expect(await toQueue.getWaitingCount()).toBe(1)

        const [movedJob] = await toQueue.getJobs(['waiting'], 0, 0)
        expect(movedJob.data.tenantId).toBe(tenantId)
    })

    it('does not move regular jobs belonging to a different tenant', async () => {
        const tenantA = apId()
        const tenantB = apId()
        const fromQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: fromQueueName })
        const toQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: toQueueName })

        const jobIdA = apId()
        const jobIdB = apId()
        await fromQueue.add(jobIdA, buildPollingJobData({ tenantId: tenantA, workflowVersionId: apId() }), { jobId: jobIdA })
        await fromQueue.add(jobIdB, buildPollingJobData({ tenantId: tenantB, workflowVersionId: apId() }), { jobId: jobIdB })

        await tenantQueueMigrationService(app.log).migrateJobs({ fromQueueName, toQueueName, tenantId: tenantA })

        expect(await fromQueue.getWaitingCount()).toBe(1)
        expect(await toQueue.getWaitingCount()).toBe(1)
    })

    describe('batch logic', () => {
        it('migrates all schedulers when count exceeds batchSize', async () => {
            const tenantId = apId()
            const fromQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: fromQueueName })
            const toQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: toQueueName })
            const total = 5

            for (let i = 0; i < total; i++) {
                const workflowVersionId = apId()
                await fromQueue.upsertJobScheduler(
                    workflowVersionId,
                    { pattern: '*/5 * * * *', tz: 'UTC' },
                    { name: workflowVersionId, data: buildPollingJobData({ tenantId, workflowVersionId }) },
                )
            }

            await tenantQueueMigrationService(app.log).migrateJobs({ fromQueueName, toQueueName, tenantId, batchSize: 2 })

            expect(await fromQueue.getJobSchedulersCount()).toBe(0)
            expect(await toQueue.getJobSchedulersCount()).toBe(total)
        })

        it('leaves other-tenant schedulers on source when count exceeds batchSize', async () => {
            const tenantA = apId()
            const tenantB = apId()
            const fromQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: fromQueueName })
            const toQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: toQueueName })

            // Interleave tenantA and tenantB schedulers to exercise multi-batch offset tracking
            for (let i = 0; i < 3; i++) {
                const idA = apId()
                await fromQueue.upsertJobScheduler(idA, { pattern: '*/5 * * * *', tz: 'UTC' }, { name: idA, data: buildPollingJobData({ tenantId: tenantA, workflowVersionId: idA }) })
                const idB = apId()
                await fromQueue.upsertJobScheduler(idB, { pattern: '*/10 * * * *', tz: 'UTC' }, { name: idB, data: buildPollingJobData({ tenantId: tenantB, workflowVersionId: idB }) })
            }

            await tenantQueueMigrationService(app.log).migrateJobs({ fromQueueName, toQueueName, tenantId: tenantA, batchSize: 2 })

            expect(await fromQueue.getJobSchedulersCount()).toBe(3)
            expect(await toQueue.getJobSchedulersCount()).toBe(3)

            const remaining = await fromQueue.getJobSchedulers(0, -1)
            expect(remaining.every(s => s.template?.data?.tenantId === tenantB)).toBe(true)
        })

        it('migrates all regular jobs when count exceeds batchSize', async () => {
            const tenantId = apId()
            const fromQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: fromQueueName })
            const toQueue = await jobQueue(app.log).getOrCreateQueue({ queueName: toQueueName })
            const total = 5

            for (let i = 0; i < total; i++) {
                const jobId = apId()
                await fromQueue.add(jobId, buildPollingJobData({ tenantId, workflowVersionId: apId() }), { jobId })
            }

            await tenantQueueMigrationService(app.log).migrateJobs({ fromQueueName, toQueueName, tenantId, batchSize: 2 })

            expect(await fromQueue.getWaitingCount()).toBe(0)
            expect(await toQueue.getWaitingCount()).toBe(total)
        })
    })
})

function buildPollingJobData({ tenantId, workflowVersionId }: { tenantId: string, workflowVersionId: string }) {
    return {
        workspaceId: apId(),
        tenantId,
        schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
        workflowVersionId,
        workflowId: apId(),
        triggerType: WorkflowTriggerType.CONNECTOR,
        jobType: WorkerJobType.EXECUTE_POLLING,
    }
}
