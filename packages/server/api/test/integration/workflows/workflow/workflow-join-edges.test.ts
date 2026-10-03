import { WorkflowActionType, WorkflowStatus, WorkflowTriggerType, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../../helpers/db'
import { createMockWorkflow, createMockWorkflowVersion } from '../../../helpers/mocks'
import { createTestContext, TestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

function codeStep({ name, nextAction }: { name: string, nextAction?: ReturnType<typeof codeStep> }) {
    return {
        type: WorkflowActionType.CODE,
        name,
        valid: true,
        displayName: name,
        lastUpdatedDate: dayjs().toISOString(),
        settings: { sourceCode: { code: 'export const code = async () => 1', packageJson: '{}' }, input: {}, errorHandlingOptions: {} },
        nextAction,
    } as const
}

async function saveChain(ctx: TestContext): Promise<string> {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.DISABLED })
    await db.save('workflow', workflow)
    await db.save('workflow_version', createMockWorkflowVersion({
        workflowId: workflow.id,
        state: WorkflowVersionState.DRAFT,
        valid: true,
        trigger: {
            type: WorkflowTriggerType.EMPTY,
            name: 'trigger',
            settings: {},
            valid: true,
            displayName: 'Trigger',
            lastUpdatedDate: dayjs().toISOString(),
            nextAction: codeStep({ name: 'step_1', nextAction: codeStep({ name: 'step_2', nextAction: codeStep({ name: 'step_3' }) }) }),
        },
    }))
    return workflow.id
}

describe('Waiting for other steps', () => {
    it('saves a wait on a step that runs earlier', async () => {
        const ctx = await createTestContext(app!)
        const workflowId = await saveChain(ctx)

        const response = await ctx.post(`/v1/workflows/${workflowId}`, { type: 'SET_JOIN_EDGES', request: { joinEdges: [{ from: 'step_1', to: 'step_3' }] } })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(response.json().version.graph.joinEdges).toEqual([{ from: 'step_1', to: 'step_3' }])
    })

    it('refuses a wait that would make steps wait for each other forever and says which', async () => {
        const ctx = await createTestContext(app!)
        const workflowId = await saveChain(ctx)

        const response = await ctx.post(`/v1/workflows/${workflowId}`, { type: 'SET_JOIN_EDGES', request: { joinEdges: [{ from: 'step_3', to: 'step_1' }] } })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        expect(JSON.stringify(response.json())).toContain('step_1 waits for step_3')
    })
})
