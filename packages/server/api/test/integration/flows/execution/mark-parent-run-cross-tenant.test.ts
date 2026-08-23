import { apId } from '@fema/core-utils'
import { ExecutionStatus, FlowVersionState, RunEnvironment } from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { markParentRunAsFailed } from '../../../../../src/app/flows/execution/executions-queue'
import { db } from '../../../../helpers/db'
import { createMockFlow, createMockFlowVersion, createMockExecution, mockAndSaveBasicSetup } from '../../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../../helpers/test-setup'

let app: FastifyInstance

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function createPausedParentWithWaitpoint(workspaceId: string) {
    const flow = createMockFlow({ workspaceId })
    await db.save('flow', flow)

    const flowVersion = createMockFlowVersion({
        flowId: flow.id,
        state: FlowVersionState.LOCKED,
    })
    await db.save('flow_version', flowVersion)

    const execution = createMockExecution({
        workspaceId,
        flowId: flow.id,
        flowVersionId: flowVersion.id,
        status: ExecutionStatus.PAUSED,
        environment: RunEnvironment.PRODUCTION,
    })
    await db.save('execution', execution)

    const waitpointId = apId()
    await db.save('waitpoint', {
        id: waitpointId,
        executionId: execution.id,
        workspaceId,
        stepName: 'approval',
        type: 'WEBHOOK',
        status: 'PENDING',
        httpRequestId: null,
        workerHandlerId: null,
    })

    return { execution, waitpointId }
}

describe('markParentRunAsFailed tenant isolation', () => {
    it('does not fail a parent run that belongs to another workspace', async () => {
        const { mockWorkspace: workspaceA } = await mockAndSaveBasicSetup()
        const { mockWorkspace: workspaceB } = await mockAndSaveBasicSetup()

        const { execution: victimRun, waitpointId } = await createPausedParentWithWaitpoint(workspaceB.id)

        await markParentRunAsFailed({
            parentRunId: victimRun.id,
            childRunId: apId(),
            workspaceId: workspaceA.id,
            log: app.log,
        })

        const waitpoint = await db.findOneBy<{ status: string }>('waitpoint', { id: waitpointId })
        expect(waitpoint?.status).toBe('PENDING')

        const run = await db.findOneBy<{ status: string }>('execution', { id: victimRun.id })
        expect(run?.status).toBe(ExecutionStatus.PAUSED)
    })

    it('fails a parent run in the same workspace', async () => {
        const { mockWorkspace } = await mockAndSaveBasicSetup()

        const { execution: parentRun, waitpointId } = await createPausedParentWithWaitpoint(mockWorkspace.id)

        await markParentRunAsFailed({
            parentRunId: parentRun.id,
            childRunId: apId(),
            workspaceId: mockWorkspace.id,
            log: app.log,
        })

        const waitpoint = await db.findOneBy<{ status: string }>('waitpoint', { id: waitpointId })
        expect(waitpoint).toBeNull()
    })
})
