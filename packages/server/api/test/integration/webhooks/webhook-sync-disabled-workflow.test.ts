import { WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import * as engineResponseWatcherModule from '../../../src/app/workers/engine-response-watcher'
import { db } from '../../helpers/db'
import { createMockWorkflow, createMockWorkflowVersion, mockAndSaveBasicSetup } from '../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null
const originalEngineResponseWatcher = engineResponseWatcherModule.engineResponseWatcher

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(() => {
    vi.spyOn(engineResponseWatcherModule, 'engineResponseWatcher').mockImplementation((log) => ({
        ...originalEngineResponseWatcher(log),
        oneTimeListener: vi.fn().mockResolvedValue({ status: StatusCodes.OK, body: {}, headers: {} }),
    }))
})

afterEach(() => {
    vi.restoreAllMocks()
})

async function createDeployedWorkflow({ status }: { status: WorkflowStatus }): Promise<string> {
    const { mockProject } = await mockAndSaveBasicSetup()
    const workflow = createMockWorkflow({ projectId: mockProject.id, status })
    await db.save('workflow', [workflow])
    const version = createMockWorkflowVersion({ workflowId: workflow.id })
    await db.save('workflow_version', [version])
    await db.update('workflow', workflow.id, { publishedVersionId: version.id, testVersionId: version.id })
    return workflow.id
}

async function callWebhook({ workflowId, suffix }: { workflowId: string, suffix: string }) {
    return app!.inject({
        method: 'POST',
        url: `/api/v1/webhooks/${workflowId}${suffix}`,
        body: { test: true },
    })
}

describe('synchronous webhook paths and workflow status', () => {
    it('rejects the production sync path for a disabled workflow and runs nothing', async () => {
        const workflowId = await createDeployedWorkflow({ status: WorkflowStatus.DISABLED })

        const response = await callWebhook({ workflowId, suffix: '/sync' })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
        expect(await db.findOneBy('execution', { workflowId })).toBeNull()
    })

    it.each(['/draft/sync', '/test-env/sync'])('keeps %s usable for a disabled workflow so it can be tested while it is built', async (suffix) => {
        const workflowId = await createDeployedWorkflow({ status: WorkflowStatus.DISABLED })

        const response = await callWebhook({ workflowId, suffix })

        expect(response.statusCode).not.toBe(StatusCodes.NOT_FOUND)
        expect(await db.findOneBy('execution', { workflowId })).not.toBeNull()
    })

    it.each(['/draft/sync', '/test-env/sync'])('starts a run on %s for an enabled workflow', async (suffix) => {
        const workflowId = await createDeployedWorkflow({ status: WorkflowStatus.ENABLED })

        const response = await callWebhook({ workflowId, suffix })

        expect(response.statusCode).not.toBe(StatusCodes.NOT_FOUND)
        expect(await db.findOneBy('execution', { workflowId })).not.toBeNull()
    })
})
