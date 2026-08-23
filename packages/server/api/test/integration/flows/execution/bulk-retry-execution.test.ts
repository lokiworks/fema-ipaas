import { FlowRetryStrategy, ExecutionStatus, FlowVersionState, RunEnvironment } from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { databaseConnection } from '../../../../../src/app/database/database-connection'
import { db } from '../../../../helpers/db'
import { createMockFlow, createMockExecution, createMockFlowVersion, mockAndSaveBasicSetup } from '../../../../helpers/mocks'
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

describe('Bulk retry flow runs (POST /v1/executions/retry)', () => {
    it('scopes retry to the createdAfter window when Select All is used', async () => {
        const workspaceId = ctx.workspace.id
        const tenDaysAgo = new Date(Date.now() - 10 * DAY_MS).toISOString()
        const threeDaysAgo = new Date(Date.now() - 3 * DAY_MS).toISOString()
        const now = new Date().toISOString()

        const { run: oldRun } = await createFailedRun({ workspaceId, createdAt: tenDaysAgo })
        const { run: midRun } = await createFailedRun({ workspaceId, createdAt: threeDaysAgo })
        const { run: newRun } = await createFailedRun({ workspaceId, createdAt: now })

        const cutoff = new Date(Date.now() - 5 * DAY_MS).toISOString()
        const response = await ctx.post('/v1/executions/retry', {
            workspaceId,
            strategy: FlowRetryStrategy.ON_LATEST_VERSION,
            createdAfter: cutoff,
        })

        expect(response.statusCode).toBe(200)

        await waitForRunCountForWorkspace({ workspaceId, expected: 5 })

        const oldStatus = await readStatus(oldRun.id)
        expect(oldStatus).toBe(ExecutionStatus.FAILED)

        const midStatus = await readStatus(midRun.id)
        expect(midStatus).toBe(ExecutionStatus.FAILED)
        const newStatus = await readStatus(newRun.id)
        expect(newStatus).toBe(ExecutionStatus.FAILED)
    })

    it('retries every matching run when createdAfter is omitted', async () => {
        const workspaceId = ctx.workspace.id
        await createFailedRun({ workspaceId, createdAt: new Date(Date.now() - 10 * DAY_MS).toISOString() })
        await createFailedRun({ workspaceId, createdAt: new Date(Date.now() - 3 * DAY_MS).toISOString() })
        await createFailedRun({ workspaceId, createdAt: new Date().toISOString() })

        const response = await ctx.post('/v1/executions/retry', {
            workspaceId,
            strategy: FlowRetryStrategy.ON_LATEST_VERSION,
        })

        expect(response.statusCode).toBe(200)
        await waitForRunCountForWorkspace({ workspaceId, expected: 6 })
    })

    it('scopes retry to the status filter', async () => {
        const workspaceId = ctx.workspace.id
        const { run: failed } = await createFailedRun({ workspaceId })
        const { run: succeeded } = await createFailedRun({
            workspaceId,
            status: ExecutionStatus.SUCCEEDED,
        })

        const response = await ctx.post('/v1/executions/retry', {
            workspaceId,
            strategy: FlowRetryStrategy.ON_LATEST_VERSION,
            status: [ExecutionStatus.FAILED],
        })

        expect(response.statusCode).toBe(200)
        await waitForRunCountForWorkspace({ workspaceId, expected: 3 })
        expect(await readStatus(failed.id)).toBe(ExecutionStatus.FAILED)
        expect(await readStatus(succeeded.id)).toBe(ExecutionStatus.SUCCEEDED)
    })

    it('scopes retry to the flowId filter', async () => {
        const workspaceId = ctx.workspace.id
        const { run: runA, flow: flowA } = await createFailedRun({ workspaceId })
        const { run: runB } = await createFailedRun({ workspaceId })

        const response = await ctx.post('/v1/executions/retry', {
            workspaceId,
            strategy: FlowRetryStrategy.ON_LATEST_VERSION,
            flowId: [flowA.id],
        })

        expect(response.statusCode).toBe(200)
        await waitForRunCountForFlow({ flowId: flowA.id, expected: 2 })
        expect(await readStatus(runA.id)).toBe(ExecutionStatus.FAILED)
        expect(await readStatus(runB.id)).toBe(ExecutionStatus.FAILED)
    })

    it('skips runs listed in excludeExecutionIds', async () => {
        const workspaceId = ctx.workspace.id
        const { run: run1 } = await createFailedRun({ workspaceId })
        const { run: run2 } = await createFailedRun({ workspaceId })
        const { run: run3 } = await createFailedRun({ workspaceId })

        const response = await ctx.post('/v1/executions/retry', {
            workspaceId,
            strategy: FlowRetryStrategy.ON_LATEST_VERSION,
            excludeExecutionIds: [run2.id],
        })

        expect(response.statusCode).toBe(200)
        await waitForRunCountForWorkspace({ workspaceId, expected: 5 })
        expect(await readStatus(run1.id)).toBe(ExecutionStatus.FAILED)
        expect(await readStatus(run2.id)).toBe(ExecutionStatus.FAILED)
        expect(await readStatus(run3.id)).toBe(ExecutionStatus.FAILED)
    })

    it('never touches runs in other workspaces', async () => {
        const workspaceId = ctx.workspace.id
        await createFailedRun({ workspaceId })

        const { mockWorkspace: otherWorkspace } = await mockAndSaveBasicSetup()
        const { run: otherRun } = await createFailedRun({ workspaceId: otherWorkspace.id })

        const response = await ctx.post('/v1/executions/retry', {
            workspaceId,
            strategy: FlowRetryStrategy.ON_LATEST_VERSION,
        })

        expect(response.statusCode).toBe(200)
        await waitForRunCountForWorkspace({ workspaceId, expected: 2 })
        expect(await countRunsForWorkspace(otherWorkspace.id)).toBe(1)
        expect(await readStatus(otherRun.id)).toBe(ExecutionStatus.FAILED)
    })
})

const DAY_MS = 24 * 60 * 60 * 1000

async function createFailedRun({
    workspaceId,
    createdAt,
    status = ExecutionStatus.FAILED,
}: {
    workspaceId: string
    createdAt?: string
    status?: ExecutionStatus
}): Promise<{ flow: { id: string }, flowVersion: { id: string }, run: { id: string } }> {
    const flow = createMockFlow({ workspaceId })
    await db.save('flow', flow)

    const flowVersion = createMockFlowVersion({
        flowId: flow.id,
        state: FlowVersionState.LOCKED,
    })
    await db.save('flow_version', flowVersion)

    const run = createMockExecution({
        workspaceId,
        flowId: flow.id,
        flowVersionId: flowVersion.id,
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

    return { flow, flowVersion, run }
}

async function countRunsForWorkspace(workspaceId: string): Promise<number> {
    return databaseConnection().getRepository('execution').count({ where: { workspaceId } })
}

async function countRunsForFlow(flowId: string): Promise<number> {
    return databaseConnection().getRepository('execution').count({ where: { flowId } })
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

async function waitForRunCountForWorkspace({ workspaceId, expected }: { workspaceId: string, expected: number }): Promise<void> {
    await waitForCount({ read: async () => countRunsForWorkspace(workspaceId), expected })
}

async function waitForRunCountForFlow({ flowId, expected }: { flowId: string, expected: number }): Promise<void> {
    await waitForCount({ read: async () => countRunsForFlow(flowId), expected })
}
