import { createHmac } from 'node:crypto'
import { WorkflowStatus, WorkflowTrigger } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { db } from '../../helpers/db'
import { createMockWorkflow, createMockWorkflowVersion, mockAndSaveBasicSetup } from '../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance
beforeAll(async () => { app = await setupTestEnvironment() })
afterAll(async () => { await teardownTestEnvironment() })

it('rejects a forged signature with 401 before creating an execution and accepts the exact signed bytes', async () => {
    const { mockProject } = await mockAndSaveBasicSetup()
    const workflow = createMockWorkflow({ projectId: mockProject.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id, trigger: WorkflowTrigger.parse({ name: 'trigger', type: 'CONNECTOR_TRIGGER', valid: true, lastUpdatedDate: new Date().toISOString(), displayName: 'Signed webhook', settings: { connectorName: '@fema-ipaas/connector-webhook', connectorVersion: '0.1.42', triggerName: 'catch_webhook', input: { authType: 'hmac', authFields: { hmacHeaderName: 'x-signature', hmacSecret: 'test-signature-secret', hmacAlgorithm: 'sha256', hmacEncoding: 'hex' } }, propertySettings: {} } }) })
    await db.save('workflow_version', version)
    await db.update('workflow', workflow.id, { publishedVersionId: version.id })
    const body = '{ "event" : "approved" }'
    const invalid = await app.inject({ method: 'POST', url: `/api/v1/webhooks/${workflow.id}`, headers: { 'content-type': 'application/json', 'x-signature': 'forged' }, payload: body })
    expect(invalid.statusCode).toBe(401)
    const signature = createHmac('sha256', 'test-signature-secret').update(body).digest('hex')
    const changed = await app.inject({ method: 'POST', url: `/api/v1/webhooks/${workflow.id}`, headers: { 'content-type': 'application/json', 'x-signature': signature }, payload: JSON.stringify({ event: 'approved' }) })
    expect(changed.statusCode).toBe(401)
    const valid = await app.inject({ method: 'POST', url: `/api/v1/webhooks/${workflow.id}`, headers: { 'content-type': 'application/json', 'x-signature': signature }, payload: body })
    expect(valid.statusCode).toBe(200)
})
