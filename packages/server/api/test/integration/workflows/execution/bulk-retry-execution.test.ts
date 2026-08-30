import { WorkflowRetryStrategy, ExecutionStatus, WorkflowVersionState, RunEnvironment } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { databaseConnection } from '../../../../../src/app/database/database-connection'
import { db } from '../../../../helpers/db'
import { createMockWorkflow, createMockExecution, createMockWorkflowVersion, mockAndSaveBasicSetup } from '../../../../helpers/mocks'
import { createTestContext, TestContext } from '../../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../../helpers/test-setup'

let app: FastifyInstance
let ctx: TestContext

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(async () => {
    ctx = await createTestContext(app)
})

describe('Bulk retry workflow runs (POST /v1/executions/retry)', () => {
    it('scopes retry to the createdAfter window when Select All is used', async () => {
        const projectId = ctx.project.id
        const tenDaysAgo = new Date(Date.now() - 10 * DAY_MS).toISOString()
        const threeDaysAgo = new Date(Date.now() - 3 * DAY_MS).toISOString()
        const now = new Date().toISOString()

        const { run: oldRun } = await createFailedRun({ projectId, createdAt: tenDaysAgo })
        const { run: midRun } = await createFailedRun({ projectId, createdAt: threeDaysAgo })
        const { run: newRun } = await createFailedRun({ projectId, createdAt: now })

        const cutoff = new Date(Date.now() - 5 * DAY_MS).toISOString()
        const response = await ctx.post('/v1/executions/retry', {
            projectId,
            strategy: WorkflowRetryStrategy.ON_LATEST_VERSION,
            createdAfter: cutoff,
        })

        expect(response.statusCode).toBe(200)

        await waitForRunCountForProject({ projectId, expected: 5 })

        const oldStatus = await readStatus(oldRun.id)
        expect(oldStatus).toBe(ExecutionStatus.FAILED)

        const midStatus = await readStatus(midRun.id)
        expect(midStatus).toBe(ExecutionStatus.FAILED)
        const newStatus = await readStatus(newRun.id)
        expect(newStatus).toBe(ExecutionStatus.FAILED)
    })

    it('retries every matching run when createdAfter is omitted', async () => {
        const projectId = ctx.project.id
        await createFailedRun({ projectId, createdAt: new Date(Date.now() - 10 * DAY_MS).toISOString() })
        await createFailedRun({ projectId, createdAt: new Date(Date.now() - 3 * DAY_MS).toISOString() })
        await createFailedRun({ projectId, createdAt: new Date().toISOString() })

        const response = await ctx.post('/v1/executions/retry', {
            projectId,
            strategy: WorkflowRetryStrategy.ON_LATEST_VERSION,
        })

        expect(response.statusCode).toBe(200)
        await waitForRunCountForProject({ projectId, expected: 6 })
    })

    it('scopes retry to the status filter', async () => {
        const projectId = ctx.project.id
        const { run: failed } = await createFailedRun({ projectId })
        const { run: succeeded } = await createFailedRun({
            projectId,
            status: ExecutionStatus.SUCCEEDED,
        })

        const response = await ctx.post('/v1/executions/retry', {
            projectId,
            strategy: WorkflowRetryStrategy.ON_LATEST_VERSION,
            status: [ExecutionStatus.FAILED],
        })

        expect(response.statusCode).toBe(200)
        await waitForRunCountForProject({ projectId, expected: 3 })
        expect(await readStatus(failed.id)).toBe(ExecutionStatus.FAILED)
        expect(await readStatus(succeeded.id)).toBe(ExecutionStatus.SUCCEEDED)
    })

    it('scopes retry to the workflowId filter', async () => {
        const projectId = ctx.project.id
        const { run: runA, workflow: workflowA } = await createFailedRun({ projectId })
        const { run: runB } = await createFailedRun({ projectId })

        const response = await ctx.post('/v1/executions/retry', {
            projectId,
            strategy: WorkflowRetryStrategy.ON_LATEST_VERSION,
            workflowId: [workflowA.id],
        })

        expect(response.statusCode).toBe(200)
        await waitForRunCountForWorkflow({ workflowId: workflowA.id, expected: 2 })
        expect(await readStatus(runA.id)).toBe(ExecutionStatus.FAILED)
        expect(await readStatus(runB.id)).toBe(ExecutionStatus.FAILED)
    })

    it('skips runs listed in excludeExecutionIds', async () => {
        const projectId = ctx.project.id
        const { run: run1 } = await createFailedRun({ projectId })
        const { run: run2 } = await createFailedRun({ projectId })
        const { run: run3 } = await createFailedRun({ projectId })

        const response = await ctx.post('/v1/executions/retry', {
            projectId,
            strategy: WorkflowRetryStrategy.ON_LATEST_VERSION,
            excludeExecutionIds: [run2.id],
        })

        expect(response.statusCode).toBe(200)
        await waitForRunCountForProject({ projectId, expected: 5 })
        expect(await readStatus(run1.id)).toBe(ExecutionStatus.FAILED)
        expect(await readStatus(run2.id)).toBe(ExecutionStatus.FAILED)
        expect(await readStatus(run3.id)).toBe(ExecutionStatus.FAILED)
    })

    it('never touches runs in other projects', async () => {
        const projectId = ctx.project.id
        await createFailedRun({ projectId })

        const { mockProject: otherProject } = await mockAndSaveBasicSetup()
        const { run: otherRun } = await createFailedRun({ projectId: otherProject.id })

        const response = await ctx.post('/v1/executions/retry', {
            projectId,
            strategy: WorkflowRetryStrategy.ON_LATEST_VERSION,
        })

        expect(response.statusCode).toBe(200)
        await waitForRunCountForProject({ projectId, expected: 2 })
        expect(await countRunsForProject(otherProject.id)).toBe(1)
        expect(await readStatus(otherRun.id)).toBe(ExecutionStatus.FAILED)
    })
})

const DAY_MS = 24 * 60 * 60 * 1000

async function createFailedRun({
    projectId,
    createdAt,
    status = ExecutionStatus.FAILED,
}: {
    projectId: string
    createdAt?: string
    status?: ExecutionStatus
}): Promise<{ workflow: { id: string }, workflowVersion: { id: string }, run: { id: string } }> {
    const workflow = createMockWorkflow({ projectId })
    await db.save('workflow', workflow)

    const workflowVersion = createMockWorkflowVersion({
        workflowId: workflow.id,
        state: WorkflowVersionState.LOCKED,
    })
    await db.save('workflow_version', workflowVersion)

    const run = createMockExecution({
        projectId,
        workflowId: workflow.id,
        workflowVersionId: workflowVersion.id,
        status,
        environment: RunEnvironment.PRODUCTION,
    })
    await db.save('execution', run)

    if (createdAt) {
        await databaseConnection().query(
            'UPDATE execution SET created = $1 WHERE id = $2',
            [createdAt, run.id],
        )
    }

    return { workflow, workflowVersion, run }
}

async function countRunsForProject(projectId: string): Promise<number> {
    return databaseConnection().getRepository('execution').count({ where: { projectId } })
}

async function countRunsForWorkflow(workflowId: string): Promise<number> {
    return databaseConnection().getRepository('execution').count({ where: { workflowId } })
}

async function readStatus(runId: string): Promise<ExecutionStatus> {
    const row = await db.findOneByOrFail<{ status: ExecutionStatus }>('execution', { id: runId })
    return row.status
}

async function waitForCount({
    read,
    expected,
    timeoutMs = 10_000,
}: {
    read: () => Promise<number>
    expected: number
    timeoutMs?: number
}): Promise<void> {
    const start = Date.now()
    let last = await read()
    while (last !== expected && Date.now() - start < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        last = await read()
    }
    expect(last).toBe(expected)
}

async function waitForRunCountForProject({ projectId, expected }: { projectId: string, expected: number }): Promise<void> {
    await waitForCount({ read: async () => countRunsForProject(projectId), expected })
}

async function waitForRunCountForWorkflow({ workflowId, expected }: { workflowId: string, expected: number }): Promise<void> {
    await waitForCount({ read: async () => countRunsForWorkflow(workflowId), expected })
}
