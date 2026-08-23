import { WorkflowStatus } from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../../helpers/db'
import { createMockWorkflow, createMockWorkflowVersion, mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function createEnabledWorkflow() {
    const { mockWorkspace } = await mockAndSaveBasicSetup()
    const mockWorkflow = createMockWorkflow({
        workspaceId: mockWorkspace.id,
        status: WorkflowStatus.ENABLED,
    })
    await db.save('workflow', [mockWorkflow])
    const mockWorkflowVersion = createMockWorkflowVersion({ workflowId: mockWorkflow.id })
    await db.save('workflow_version', [mockWorkflowVersion])
    await db.update('workflow', mockWorkflow.id, { publishedVersionId: mockWorkflowVersion.id })
    return mockWorkflow
}

describe('Webhook XML body parsing', () => {
    it('should accept application/xml content type', async () => {
        const workflow = await createEnabledWorkflow()
        const response = await app!.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${workflow.id}`,
            headers: { 'content-type': 'application/xml' },
            payload: '<root><item>hello</item></root>',
        })
        expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('should accept text/xml content type', async () => {
        const workflow = await createEnabledWorkflow()
        const response = await app!.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${workflow.id}`,
            headers: { 'content-type': 'text/xml' },
            payload: '<root><item>hello</item></root>',
        })
        expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('should accept application/rss+xml content type', async () => {
        const workflow = await createEnabledWorkflow()
        const response = await app!.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${workflow.id}`,
            headers: { 'content-type': 'application/rss+xml' },
            payload: '<rss version="2.0"><channel><title>Feed</title></channel></rss>',
        })
        expect(response.statusCode).toBe(StatusCodes.OK)
    })

    // fast-xml-parser is intentionally lenient and does not throw on structural
    // issues like unclosed tags, so we only assert the server does not crash.
    it('should not crash on structurally invalid XML', async () => {
        const workflow = await createEnabledWorkflow()
        const response = await app!.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${workflow.id}`,
            headers: { 'content-type': 'application/xml' },
            payload: '<unclosed>',
        })
        expect(response.statusCode).not.toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })

    // The server must survive entity injection payloads without a 500 crash.
    // Body-level entity override isolation is covered by the unit test in
    // test/unit/app/webhooks/webhook-xml-parser.test.ts.
    it('should not crash on DOCTYPE entity injection', async () => {
        const workflow = await createEnabledWorkflow()
        const maliciousXml = [
            '<?xml version="1.0"?>',
            '<!DOCTYPE x [',
            '  <!ENTITY lt "INJECTED">',
            ']>',
            '<root><item>&lt;script&gt;alert(1)&lt;/script&gt;</item></root>',
        ].join('\n')

        const response = await app!.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${workflow.id}`,
            headers: { 'content-type': 'application/xml' },
            payload: maliciousXml,
        })
        expect(response.statusCode).not.toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
})
