import { apId } from '@fema/core-utils'
import { ExecutionStatus, FlowVersionState, PauseType, RunEnvironment } from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { resumeService } from '../../../../../src/app/flows/execution/waitpoint/resume-service'
import { waitpointService } from '../../../../../src/app/flows/execution/waitpoint/waitpoint-service'
import { WaitpointStatus } from '../../../../../src/app/flows/execution/waitpoint/waitpoint-types'
import { db } from '../../../../helpers/db'
import { createMockFlow, createMockExecution, createMockFlowVersion } from '../../../../helpers/mocks'
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

async function createExecutionAndWaitpoint(params: {
    workspaceId: string
    executionStatus?: ExecutionStatus
    waitpointStatus?: WaitpointStatus
}) {
    const flow = createMockFlow({ workspaceId: params.workspaceId })
    await db.save('flow', flow)

    const flowVersion = createMockFlowVersion({
        flowId: flow.id,
        state: FlowVersionState.LOCKED,
    })
    await db.save('flow_version', flowVersion)

    const execution = createMockExecution({
        workspaceId: params.workspaceId,
        flowId: flow.id,
        flowVersionId: flowVersion.id,
        status: params.executionStatus ?? ExecutionStatus.PAUSED,
        environment: RunEnvironment.PRODUCTION,
    })
    await db.save('execution', execution)

    const waitpointId = apId()
    await db.save('waitpoint', {
        id: waitpointId,
        executionId: execution.id,
        workspaceId: params.workspaceId,
        stepName: 'approval',
        type: 'WEBHOOK',
        status: params.waitpointStatus ?? WaitpointStatus.PENDING,
        httpRequestId: null,
        workerHandlerId: null,
    })

    return { flow, flowVersion, execution, waitpointId }
}

describe('resumeService resumeFromWaitpointWithoutLock', () => {
    it('consumes a PENDING waitpoint and enqueues resume when flow is PAUSED (worker-before-callback ordering)', async () => {
        const { execution, waitpointId } = await createExecutionAndWaitpoint({
            workspaceId: ctx.workspace.id,
            executionStatus: ExecutionStatus.PAUSED,
            waitpointStatus: WaitpointStatus.PENDING,
        })

        const result = await resumeService(app.log).resumeFromWaitpointWithoutLock({
            executionId: execution.id,
            waitpointId,
            resumePayload: { body: { status: 'approved' } },
        })

        expect(result.stale).toBe(false)

        const waitpoint = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpoint).toBeNull()
    })

    it('consumes a COMPLETED waitpoint when race recovery fires (callback-before-worker ordering)', async () => {
        const { execution, waitpointId } = await createExecutionAndWaitpoint({
            workspaceId: ctx.workspace.id,
            executionStatus: ExecutionStatus.RUNNING,
            waitpointStatus: WaitpointStatus.PENDING,
        })

        await waitpointService(app.log).complete({
            executionId: execution.id,
            workspaceId: ctx.workspace.id,
            waitpointId,
            resumePayload: { body: { status: 'early' } },
        })

        await db.update('execution', execution.id, { status: ExecutionStatus.PAUSED })

        const result = await resumeService(app.log).resumeFromWaitpointWithoutLock({
            executionId: execution.id,
            waitpointId,
            resumePayload: { body: { status: 'early' } },
        })

        expect(result.stale).toBe(false)

        const waitpoint = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpoint).toBeNull()
    })

    it('does not leave a stale COMPLETED row to poison the next pause cycle (leftover-row regression)', async () => {
        const { execution, waitpointId } = await createExecutionAndWaitpoint({
            workspaceId: ctx.workspace.id,
            executionStatus: ExecutionStatus.RUNNING,
            waitpointStatus: WaitpointStatus.PENDING,
        })

        await waitpointService(app.log).complete({
            executionId: execution.id,
            workspaceId: ctx.workspace.id,
            waitpointId,
            resumePayload: { body: { status: 'quick' } },
        })

        await db.update('execution', execution.id, { status: ExecutionStatus.PAUSED })

        await resumeService(app.log).resumeFromWaitpointWithoutLock({
            executionId: execution.id,
            waitpointId,
            resumePayload: { body: { status: 'quick' } },
        })

        const freshPause = await waitpointService(app.log).createForPause({
            executionId: execution.id,
            workspaceId: ctx.workspace.id,
            stepName: 'approval',
            type: PauseType.WEBHOOK,
            version: 'V1',
        })

        expect(freshPause.inserted).toBe(true)
        expect(freshPause.waitpoint.status).toBe(WaitpointStatus.PENDING)
        expect(freshPause.waitpoint.stepName).toBe('approval')
        expect(freshPause.waitpoint.resumePayload).toBeNull()
    })

    it('returns stale=true when no PENDING waitpoint exists', async () => {
        const { execution } = await createExecutionAndWaitpoint({
            workspaceId: ctx.workspace.id,
            executionStatus: ExecutionStatus.PAUSED,
            waitpointStatus: WaitpointStatus.PENDING,
        })

        const bogusWaitpointId = apId()
        const result = await resumeService(app.log).resumeFromWaitpointWithoutLock({
            executionId: execution.id,
            waitpointId: bogusWaitpointId,
            resumePayload: { body: { status: 'stale' } },
        })

        expect(result.stale).toBe(true)

        const waitpoint = await db.findOneBy('waitpoint', { executionId: execution.id })
        expect(waitpoint).not.toBeNull()
    })
})
