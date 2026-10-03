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

async function seedRun({ ctx, workflowId, versionId, status, stepsCount }: { ctx: TestContext, workflowId: string, versionId: string, status: ExecutionStatus, stepsCount: number }): Promise<void> {
    await db.save('execution', {
        ...createMockExecution({
            projectId: ctx.project.id,
            workflowId,
            workflowVersionId: versionId,
            status,
            environment: RunEnvironment.PRODUCTION,
            created: dayjs().subtract(2, 'minute').toISOString(),
            startTime: dayjs().subtract(2, 'minute').toISOString(),
            finishTime: dayjs().subtract(1, 'minute').toISOString(),
        }),
        stepsCount,
    })
}

describe('Run monitor executed steps', () => {
    it('counts the step each failed run stopped at, so failures do not pull the average down', async () => {
        const ctx = await createTestContext(app!)
        const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
        await db.save('workflow', workflow)
        const version = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED, valid: true })
        await db.save('workflow_version', version)
        const seed = (status: ExecutionStatus, stepsCount: number) => seedRun({ ctx, workflowId: workflow.id, versionId: version.id, status, stepsCount })
        await seed(ExecutionStatus.SUCCEEDED, 3)
        await seed(ExecutionStatus.SUCCEEDED, 3)
        await seed(ExecutionStatus.FAILED, 0)
        await seed(ExecutionStatus.FAILED, 1)
        await seed(ExecutionStatus.CANCELED, 2)

        const summary = (await ctx.get('/v1/run-monitor/summary', { range: '24h', timezone: 'UTC' })).json()

        expect(summary.stats.runs).toBe(5)
        expect(summary.stats.failed).toBe(2)
        expect(summary.stats.executedSteps).toBe(3 + 3 + 0 + 1 + 2 + 2)
    })
})
