import { FileType, Workflow, WorkflowStatus, Project, WebhookHandshakeStrategy } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { webhookHandshake } from '../../../../src/app/webhooks/webhook-handshake'
import { db } from '../../../helpers/db'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { createMockWorkflow, createMockWorkflowVersion, mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance

beforeAll(async () => {
    app = await setupTestEnvironment({ fresh: true })
})

afterAll(async () => {
    vi.restoreAllMocks()
    await teardownTestEnvironment()
})

// A trigger with a handshakeConfiguration makes handleWebhook resolve the request payload twice
// (once for the handshake check, once for the run). The request body stream can only be read once,
// so the second read used to stream an empty body — persisting a second, 0-byte step file whose URL
// the run then used. Guard: exactly one step file, and it holds the full bytes.
describe('Webhook file streaming with a handshake-configured trigger', () => {
    it('persists a single non-empty step file (no empty duplicate)', async () => {
        vi.spyOn(webhookHandshake, 'getWebhookHandshakeConfiguration').mockResolvedValue({
            strategy: WebhookHandshakeStrategy.HEADER_PRESENT,
            paramName: 'x-ap-handshake-absent',
        })
        const { mockWorkflow, mockProject } = await createEnabledWorkflow()
        const content = 'A'.repeat(4 * 1024 * 1024)

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${mockWorkflow.id}`,
            headers: { 'content-type': 'application/pdf' },
            payload: Buffer.from(content),
        })
        expect(response.statusCode).toBe(StatusCodes.OK)

        const files = await databaseConnection().getRepository('file').findBy({
            projectId: mockProject.id,
            type: FileType.WORKFLOW_STEP_FILE,
        })
        expect(files).toHaveLength(1)
        expect(files[0].size).toBe(content.length)
    })
})

async function createEnabledWorkflow(): Promise<{ mockWorkflow: Workflow, mockProject: Project }> {
    const { mockProject } = await mockAndSaveBasicSetup()
    const mockWorkflow = createMockWorkflow({ projectId: mockProject.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', [mockWorkflow])
    const mockWorkflowVersion = createMockWorkflowVersion({ workflowId: mockWorkflow.id })
    await db.save('workflow_version', [mockWorkflowVersion])
    await db.update('workflow', mockWorkflow.id, { publishedVersionId: mockWorkflowVersion.id })
    return { mockWorkflow, mockProject }
}
