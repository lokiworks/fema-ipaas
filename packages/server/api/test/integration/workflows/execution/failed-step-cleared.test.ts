import { ExecutionStatus, RunEnvironment, WorkflowVersionState } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { executionRepo } from '../../../../src/app/workflows/execution/execution-service'
import { executionsQueueUtils } from '../../../../src/app/workflows/execution/executions-queue'
import { db } from '../../../helpers/db'
import { createMockExecution, createMockWorkflow, createMockWorkflowVersion, mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function saveFailedRun(): Promise<string> {
    const { mockProject } = await mockAndSaveBasicSetup()
    const workflow = createMockWorkflow({ projectId: mockProject.id })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED })
    await db.save('workflow_version', version)
    const execution = {
        ...createMockExecution({ projectId: mockProject.id, workflowId: workflow.id, workflowVersionId: version.id, status: ExecutionStatus.FAILED, environment: RunEnvironment.PRODUCTION }),
        failedStep: { name: 'step_1', displayName: 'Step 1', message: 'boom' },
    }
    await db.save('execution', execution)
    return execution.id
}

describe('failed step of a run', () => {
    it('is cleared in the database once the run is saved as succeeded', async () => {
        const id = await saveFailedRun()

        await executionRepo().update(id, { status: ExecutionStatus.SUCCEEDED, ...executionsQueueUtils.failedStepUpdate({ status: ExecutionStatus.SUCCEEDED, failedStep: undefined }) })

        const saved = await executionRepo().findOneByOrFail({ id })
        expect(saved.status).toBe(ExecutionStatus.SUCCEEDED)
        expect(saved.failedStep ?? null).toBeNull()
    })

    it('stays while the run is still failed', async () => {
        const id = await saveFailedRun()

        await executionRepo().update(id, { ...executionsQueueUtils.failedStepUpdate({ status: ExecutionStatus.FAILED, failedStep: undefined }) })

        expect((await executionRepo().findOneByOrFail({ id })).failedStep?.message).toBe('boom')
    })
})
