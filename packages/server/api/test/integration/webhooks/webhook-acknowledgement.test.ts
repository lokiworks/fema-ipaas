import { WebhookHandshakeStrategy, WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { webhookHandshake } from '../../../src/app/webhooks/webhook-handshake'
import { payloadOffloader } from '../../../src/app/workers/payload-offloader'
import { db } from '../../helpers/db'
import { createMockWorkflow, createMockWorkflowVersion, mockAndSaveBasicSetup } from '../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance
beforeAll(async () => { app = await setupTestEnvironment({ fresh: true }) })
afterAll(async () => { vi.restoreAllMocks(); await teardownTestEnvironment() })
afterEach(() => vi.restoreAllMocks())

async function fixture() {
    vi.spyOn(webhookHandshake, 'getWebhookHandshakeConfiguration').mockResolvedValue({ strategy: WebhookHandshakeStrategy.ALWAYS })
    const { mockProject } = await mockAndSaveBasicSetup()
    const workflow = createMockWorkflow({ projectId: mockProject.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id })
    await db.save('workflow_version', version)
    await db.update('workflow', workflow.id, { publishedVersionId: version.id })
    return workflow
}

it('queues the verified payload before returning the provider acknowledgement', async () => {
    const workflow = await fixture()
    const verified = { body: { EventType: 'user_add_org', UserId: 'employee-1' }, headers: {}, queryParams: {}, method: 'POST' }
    vi.spyOn(webhookHandshake, 'handleHandshakeRequest').mockResolvedValue({ status: 200, body: { encrypt: 'acknowledgement' }, continueToRun: true, triggerPayload: verified })
    const offload = vi.spyOn(payloadOffloader, 'offloadPayload')
    const response = await app.inject({ method: 'POST', url: `/api/v1/webhooks/${workflow.id}`, payload: { encrypt: 'ciphertext' } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ encrypt: 'acknowledgement' })
    expect(offload).toHaveBeenCalledWith(expect.anything(), verified, workflow.projectId, expect.any(String))
})

it('does not enqueue an unverified callback', async () => {
    const workflow = await fixture()
    vi.spyOn(webhookHandshake, 'handleHandshakeRequest').mockResolvedValue({ status: 401, body: 'Invalid callback signature' })
    const offload = vi.spyOn(payloadOffloader, 'offloadPayload')
    const response = await app.inject({ method: 'POST', url: `/api/v1/webhooks/${workflow.id}`, payload: { encrypt: 'forged' } })
    expect(response.statusCode).toBe(401)
    expect(offload).not.toHaveBeenCalled()
})
