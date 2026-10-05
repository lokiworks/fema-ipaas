import { ExecutionStatus, FileCompression, FileType, RunEnvironment, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { redisConnections } from '../../../src/app/database/redis-connections'
import { fileService } from '../../../src/app/file/file.service'
import { jobBroker } from '../../../src/app/workers/job-queue/job-broker'
import { jobQueue } from '../../../src/app/workers/job-queue/job-queue'
import { queueMigration } from '../../../src/app/workers/migrations/queue-migration-runner'
import { redisStateGuard } from '../../../src/app/workers/redis-state-guard'
import { db } from '../../helpers/db'
import { createMockExecution, createMockWorkflow, createMockWorkflowVersion, mockAndSaveBasicSetup } from '../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance

beforeAll(async () => {
    app = await setupTestEnvironment()
    await jobBroker(app.log).init()
    await queueMigration(app.log).run()
})

afterAll(async () => {
    await jobBroker(app.log).close()
    await teardownTestEnvironment()
})

async function seedQueuedRun({ withPayload }: { withPayload: boolean }): Promise<{ executionId: string, payloadFileId: string | null }> {
    const { mockTenant, mockProject } = await mockAndSaveBasicSetup()
    const workflow = createMockWorkflow({ projectId: mockProject.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED, valid: true })
    await db.save('workflow_version', version)
    const execution = createMockExecution({
        projectId: mockProject.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        status: ExecutionStatus.QUEUED,
        environment: RunEnvironment.PRODUCTION,
        created: dayjs().subtract(45, 'second').toISOString(),
    })
    await db.save('execution', execution)
    if (!withPayload) {
        return { executionId: execution.id, payloadFileId: null }
    }
    const data = Buffer.from(JSON.stringify({ recordInfo: { jobNumber: 'E1' } }), 'utf8')
    const file = await fileService(app.log).save({
        projectId: mockProject.id,
        tenantId: mockTenant.id,
        data,
        size: data.length,
        type: FileType.WEBHOOK_PAYLOAD,
        compression: FileCompression.NONE,
        metadata: { executionId: execution.id },
    })
    return { executionId: execution.id, payloadFileId: file.id }
}

async function wipeRedis(): Promise<void> {
    const redis = await redisConnections.useExisting()
    await redis.flushdb()
}

describe('redisStateGuard', () => {
    it('does nothing while Redis still has its queue marker', async () => {
        expect(await redisStateGuard(app.log).check()).toBeNull()
    })

    it('puts a queued run back in the queue from its stored payload after Redis lost its data', async () => {
        const { executionId, payloadFileId } = await seedQueuedRun({ withPayload: true })
        await wipeRedis()

        const report = await redisStateGuard(app.log).check()

        expect(report?.requeued).toBeGreaterThanOrEqual(1)
        const job = await jobQueue(app.log).getSharedQueue().getJob(executionId)
        expect(job?.data.payload).toEqual({ type: 'ref', fileId: payloadFileId })
        expect(await queueMigration(app.log).hasMarker()).toBe(true)
    })

    it('does not queue a run twice when its job survived', async () => {
        const { executionId } = await seedQueuedRun({ withPayload: true })
        await wipeRedis()
        await redisStateGuard(app.log).check()
        const first = await jobQueue(app.log).getSharedQueue().getJob(executionId)
        await wipeRedis()
        await jobQueue(app.log).getSharedQueue().add(executionId, first?.data ?? {}, { jobId: executionId })

        await redisStateGuard(app.log).check()

        const jobs = await jobQueue(app.log).getSharedQueue().getJobs(['waiting', 'prioritized', 'delayed'])
        expect(jobs.filter((job) => job.id === executionId)).toHaveLength(1)
    })

    it('reports a queued run that has no stored payload as failed instead of leaving it queued forever', async () => {
        await seedQueuedRun({ withPayload: false })
        await wipeRedis()

        const report = await redisStateGuard(app.log).check()

        expect(report?.failed).toBeGreaterThanOrEqual(1)
    })
})
