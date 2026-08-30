import { generateId } from '@fema-ipaas/core-utils'
import { ExecutionStatus, WorkflowVersionState, RunEnvironment } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { markParentRunAsFailed } from '../../../../src/app/workflows/execution/executions-queue'
import { db } from '../../../helpers/db'
import { createMockWorkflow, createMockWorkflowVersion, createMockExecution, mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function createPausedParentWithWaitpoint(projectId: string) {
    const workflow = createMockWorkflow({ projectId })
    await db.save('workflow', workflow)

    const workflowVersion = createMockWorkflowVersion({
        workflowId: workflow.id,
        state: WorkflowVersionState.LOCKED,
    })
    await db.save('workflow_version', workflowVersion)

    const execution = createMockExecution({
        projectId,
        workflowId: workflow.id,
        workflowVersionId: workflowVersion.id,
        status: ExecutionStatus.PAUSED,
        environment: RunEnvironment.PRODUCTION,
    })
    await db.save('execution', execution)

    const waitpointId = generateId()
    await db.save('waitpoint', {
        id: waitpointId,
        executionId: execution.id,
        projectId,
        stepName: 'approval',
        type: 'WEBHOOK',
        status: 'PENDING',
        httpRequestId: null,
        workerHandlerId: null,
    })

    return { execution, waitpointId }
}

describe('markParentRunAsFailed tenant isolation', () => {
    it('does not fail a parent run that belongs to another project', async () => {
        const { mockProject: projectA } = await mockAndSaveBasicSetup()
        const { mockProject: projectB } = await mockAndSaveBasicSetup()

        const { execution: victimRun, waitpointId } = await createPausedParentWithWaitpoint(projectB.id)

        await markParentRunAsFailed({
            parentRunId: victimRun.id,
            childRunId: generateId(),
            projectId: projectA.id,
            log: app.log,
        })

        const waitpoint = await db.findOneBy<{ status: string }>('waitpoint', { id: waitpointId })
        expect(waitpoint?.status).toBe('PENDING')

        const run = await db.findOneBy<{ status: string }>('execution', { id: victimRun.id })
        expect(run?.status).toBe(ExecutionStatus.PAUSED)
    })

    it('fails a parent run in the same project', async () => {
        const { mockProject } = await mockAndSaveBasicSetup()

        const { execution: parentRun, waitpointId } = await createPausedParentWithWaitpoint(mockProject.id)

        await markParentRunAsFailed({
            parentRunId: parentRun.id,
            childRunId: generateId(),
            projectId: mockProject.id,
            log: app.log,
        })

        const waitpoint = await db.findOneBy<{ status: string }>('waitpoint', { id: waitpointId })
        expect(waitpoint).toBeNull()
    })
})
