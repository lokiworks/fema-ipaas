import { ExecutionStatus, RunEnvironment, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { db } from '../../helpers/db'
import { createMockExecution, createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function seedRuns({ ctx, statuses }: { ctx: TestContext, statuses: ExecutionStatus[] }): Promise<void> {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED, valid: true })
    await db.save('workflow_version', version)
    await db.save('execution', statuses.map((status, index) => createMockExecution({
        projectId: ctx.project.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        status,
        environment: RunEnvironment.PRODUCTION,
        created: dayjs().subtract(index + 1, 'minute').toISOString(),
        startTime: dayjs().subtract(index + 1, 'minute').toISOString(),
        finishTime: dayjs().subtract(index, 'minute').toISOString(),
    })))
}

describe('Failure counts agree across home, run monitor and run logs', () => {
    it('counts the same failure statuses everywhere, including runs that exceeded the log size', async () => {
        const ctx = await createTestContext(app!)
        await seedRuns({
            ctx,
            statuses: [
                ExecutionStatus.SUCCEEDED,
                ExecutionStatus.FAILED,
                ExecutionStatus.TIMEOUT,
                ExecutionStatus.MEMORY_LIMIT_EXCEEDED,
                ExecutionStatus.LOG_SIZE_EXCEEDED,
                ExecutionStatus.INTERNAL_ERROR,
                ExecutionStatus.CANCELED,
            ],
        })
        const since = dayjs().subtract(2, 'hour').toISOString()

        const home = (await ctx.get('/v1/home/summary', { since })).json()
        const monitor = (await ctx.get('/v1/run-monitor/summary', { range: '7d', timezone: 'Asia/Shanghai' })).json()
        const logs = (await ctx.get('/v1/run-logs', { time: '24h', limit: 100 })).json().data

        const logFailures = logs.filter((row: { errorCount: number }) => row.errorCount > 0).length
        expect(monitor.stats.failed).toBe(5)
        expect(home.runs.failedOrTimeout).toBe(monitor.stats.failed)
        expect(logFailures).toBe(monitor.stats.failed)
    })
})
