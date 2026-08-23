import { apId, EngineResponseStatus, WorkflowStatus, ConnectorType, PrincipalType, TriggerStrategy, WebhookHandshakeStrategy } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import { createMockWorkflow, createMockWorkflowVersion, createMockConnectorMetadata, mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'
import { userInteractionWatcher } from '../../../../src/app/workers/user-interaction-watcher'

let app: FastifyInstance | null = null
const MOCK_WORKFLOW_ID = '8hfKOpm3kY1yAi1ApYOa1'
beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})
describe('Webhook Service', () => {
    it('should accept webhook for enabled workflow', async () => {
        const { mockWorkspace, mockTenant, mockOwner } = await mockAndSaveBasicSetup()
        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.ENABLED,
        })
        await db.save('workflow', [mockWorkflow])
        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
        })
        await db.save('workflow_version', [mockWorkflowVersion])
        await db.update('workflow', mockWorkflow.id, {
            publishedVersionId: mockWorkflowVersion.id,
        })
        const mockToken = await generateMockToken({
            type: PrincipalType.USER,
            tenant: {
                id: mockTenant.id,
            },
            id: mockOwner.id,
        })
        const response = await app?.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${mockWorkflow.id}`,
            headers: {
                authorization: `Bearer ${mockToken}`,
            },
            body: { test: true },
        })
        expect(response?.statusCode).toBe(StatusCodes.OK)
    })

    it('should return GONE if the workflow is not found', async () => {
        const { mockOwner, mockTenant } = await mockAndSaveBasicSetup()
        const mockToken = await generateMockToken({
            type: PrincipalType.USER,
            id: mockOwner.id,
            tenant: {
                id: mockTenant.id,
            },
        })

        const response = await app?.inject({
            method: 'GET',
            url: `/api/v1/webhooks/${MOCK_WORKFLOW_ID}`,
            headers: {
                authorization: `Bearer ${mockToken}`,
            },
        })
        expect(response?.statusCode).toBe(StatusCodes.GONE)
    })
    it('should return NOT FOUND if the workflow is disabled', async () => {
        const { mockWorkspace, mockTenant, mockOwner } = await mockAndSaveBasicSetup()
        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.DISABLED,
        })
        await db.save('workflow', [mockWorkflow])
        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
        })
        await db.save('workflow_version', [mockWorkflowVersion])
        await db.update('workflow', mockWorkflow.id, {
            publishedVersionId: mockWorkflowVersion.id,
        })
        const mockToken = await generateMockToken({
            type: PrincipalType.USER,
            tenant: {
                id: mockTenant.id,
            },
            id: mockOwner.id,
        })
        const response = await app?.inject({
            method: 'GET',
            url: `/api/v1/webhooks/${mockWorkflow.id}`,
            headers: {
                authorization: `Bearer ${mockToken}`,
            },
        })
        expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('should pass query parameters in webhook payload', async () => {
        const { mockWorkspace, mockTenant, mockOwner } = await mockAndSaveBasicSetup()
        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.ENABLED,
        })
        await db.save('workflow', [mockWorkflow])
        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
        })
        await db.save('workflow_version', [mockWorkflowVersion])
        await db.update('workflow', mockWorkflow.id, {
            publishedVersionId: mockWorkflowVersion.id,
        })
        const mockToken = await generateMockToken({
            type: PrincipalType.USER,
            tenant: {
                id: mockTenant.id,
            },
            id: mockOwner.id,
        })
        const response = await app?.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${mockWorkflow.id}?foo=bar&baz=qux`,
            headers: {
                authorization: `Bearer ${mockToken}`,
            },
            body: { test: true },
        })
        expect(response?.statusCode).toBe(StatusCodes.OK)
    })

    it('should accept GET method', async () => {
        const { mockWorkspace, mockTenant, mockOwner } = await mockAndSaveBasicSetup()
        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.ENABLED,
        })
        await db.save('workflow', [mockWorkflow])
        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
        })
        await db.save('workflow_version', [mockWorkflowVersion])
        await db.update('workflow', mockWorkflow.id, {
            publishedVersionId: mockWorkflowVersion.id,
        })
        const mockToken = await generateMockToken({
            type: PrincipalType.USER,
            tenant: {
                id: mockTenant.id,
            },
            id: mockOwner.id,
        })
        const response = await app?.inject({
            method: 'GET',
            url: `/api/v1/webhooks/${mockWorkflow.id}`,
            headers: {
                authorization: `Bearer ${mockToken}`,
            },
        })
        expect(response?.statusCode).toBe(StatusCodes.OK)
    })

    it('should accept PUT method', async () => {
        const { mockWorkspace, mockTenant, mockOwner } = await mockAndSaveBasicSetup()
        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.ENABLED,
        })
        await db.save('workflow', [mockWorkflow])
        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
        })
        await db.save('workflow_version', [mockWorkflowVersion])
        await db.update('workflow', mockWorkflow.id, {
            publishedVersionId: mockWorkflowVersion.id,
        })
        const mockToken = await generateMockToken({
            type: PrincipalType.USER,
            tenant: {
                id: mockTenant.id,
            },
            id: mockOwner.id,
        })
        const response = await app?.inject({
            method: 'PUT',
            url: `/api/v1/webhooks/${mockWorkflow.id}`,
            headers: {
                authorization: `Bearer ${mockToken}`,
            },
            body: { test: true },
        })
        expect(response?.statusCode).toBe(StatusCodes.OK)
    })

    it('should accept DELETE method', async () => {
        const { mockWorkspace, mockTenant, mockOwner } = await mockAndSaveBasicSetup()
        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.ENABLED,
        })
        await db.save('workflow', [mockWorkflow])
        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
        })
        await db.save('workflow_version', [mockWorkflowVersion])
        await db.update('workflow', mockWorkflow.id, {
            publishedVersionId: mockWorkflowVersion.id,
        })
        const mockToken = await generateMockToken({
            type: PrincipalType.USER,
            tenant: {
                id: mockTenant.id,
            },
            id: mockOwner.id,
        })
        const response = await app?.inject({
            method: 'DELETE',
            url: `/api/v1/webhooks/${mockWorkflow.id}`,
            headers: {
                authorization: `Bearer ${mockToken}`,
            },
        })
        expect(response?.statusCode).toBe(StatusCodes.OK)
    })

    it('should return x-webhook-id header in response', async () => {
        const { mockWorkspace, mockTenant, mockOwner } = await mockAndSaveBasicSetup()
        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.ENABLED,
        })
        await db.save('workflow', [mockWorkflow])
        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
        })
        await db.save('workflow_version', [mockWorkflowVersion])
        await db.update('workflow', mockWorkflow.id, {
            publishedVersionId: mockWorkflowVersion.id,
        })
        const mockToken = await generateMockToken({
            type: PrincipalType.USER,
            tenant: {
                id: mockTenant.id,
            },
            id: mockOwner.id,
        })
        const response = await app?.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${mockWorkflow.id}`,
            headers: {
                authorization: `Bearer ${mockToken}`,
            },
            body: { test: true },
        })
        expect(response?.statusCode).toBe(StatusCodes.OK)
        expect(response?.headers['x-webhook-id']).toBeDefined()
    })

    it('should accept webhook on draft endpoint', async () => {
        const { mockWorkspace, mockTenant, mockOwner } = await mockAndSaveBasicSetup()
        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.DISABLED,
        })
        await db.save('workflow', [mockWorkflow])
        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
        })
        await db.save('workflow_version', [mockWorkflowVersion])
        const mockToken = await generateMockToken({
            type: PrincipalType.USER,
            tenant: {
                id: mockTenant.id,
            },
            id: mockOwner.id,
        })
        const response = await app?.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${mockWorkflow.id}/draft`,
            headers: {
                authorization: `Bearer ${mockToken}`,
            },
            body: { test: true },
        })
        expect(response?.statusCode).toBe(StatusCodes.OK)
    })

    it('should return 413 when webhook payload exceeds MAX_WEBHOOK_PAYLOAD_SIZE_MB', async () => {
        const { mockWorkspace, mockTenant, mockOwner } = await mockAndSaveBasicSetup()
        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.ENABLED,
        })
        await db.save('workflow', [mockWorkflow])
        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
        })
        await db.save('workflow_version', [mockWorkflowVersion])
        await db.update('workflow', mockWorkflow.id, {
            publishedVersionId: mockWorkflowVersion.id,
        })
        const mockToken = await generateMockToken({
            type: PrincipalType.USER,
            tenant: {
                id: mockTenant.id,
            },
            id: mockOwner.id,
        })
        // Generate payload larger than 25MB (default limit)
        const largePayload = { data: 'x'.repeat(26 * 1024 * 1024) }
        const response = await app?.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${mockWorkflow.id}`,
            headers: {
                authorization: `Bearer ${mockToken}`,
            },
            body: largePayload,
        })
        expect(response?.statusCode).toBe(StatusCodes.REQUEST_TOO_LONG)
    })

    it('should accept webhook payload under MAX_WEBHOOK_PAYLOAD_SIZE_MB', async () => {
        const { mockWorkspace, mockTenant, mockOwner } = await mockAndSaveBasicSetup()
        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.ENABLED,
        })
        await db.save('workflow', [mockWorkflow])
        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
        })
        await db.save('workflow_version', [mockWorkflowVersion])
        await db.update('workflow', mockWorkflow.id, {
            publishedVersionId: mockWorkflowVersion.id,
        })
        const mockToken = await generateMockToken({
            type: PrincipalType.USER,
            tenant: {
                id: mockTenant.id,
            },
            id: mockOwner.id,
        })
        const response = await app?.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${mockWorkflow.id}`,
            headers: {
                authorization: `Bearer ${mockToken}`,
            },
            body: { test: true },
        })
        expect(response?.statusCode).toBe(StatusCodes.OK)
    })

    it('should return 413 for sync webhook when payload exceeds limit', async () => {
        const { mockWorkspace, mockTenant, mockOwner } = await mockAndSaveBasicSetup()
        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.ENABLED,
        })
        await db.save('workflow', [mockWorkflow])
        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
        })
        await db.save('workflow_version', [mockWorkflowVersion])
        await db.update('workflow', mockWorkflow.id, {
            publishedVersionId: mockWorkflowVersion.id,
        })
        const mockToken = await generateMockToken({
            type: PrincipalType.USER,
            tenant: {
                id: mockTenant.id,
            },
            id: mockOwner.id,
        })
        const largePayload = { data: 'x'.repeat(26 * 1024 * 1024) }
        const response = await app?.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${mockWorkflow.id}/sync`,
            headers: {
                authorization: `Bearer ${mockToken}`,
            },
            body: largePayload,
        })
        expect(response?.statusCode).toBe(StatusCodes.REQUEST_TOO_LONG)
    })

    it('should process handshake for DISABLED workflow during publish window', async () => {
        const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()

        const triggerName = 'new_webhook'
        const connectorName = 'test-handshake-connector'
        const connectorVersion = '1.0.0'

        const mockConnector = createMockConnectorMetadata({
            tenantId: mockTenant.id,
            connectorType: ConnectorType.CUSTOM,
            name: connectorName,
            version: connectorVersion,
            triggers: {
                [triggerName]: {
                    handshakeConfiguration: {
                        strategy: WebhookHandshakeStrategy.QUERY_PRESENT,
                        paramName: 'hub_challenge',
                    },
                },
            },
        })
        await db.save('connector_metadata', [mockConnector])

        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.DISABLED,
        })
        await db.save('workflow', [mockWorkflow])

        const mockWorkflowVersion = createMockWorkflowVersion({ workflowId: mockWorkflow.id })
        await db.save('workflow_version', [mockWorkflowVersion])
        await db.update('workflow', mockWorkflow.id, { publishedVersionId: mockWorkflowVersion.id })

        await db.save('trigger_source', [{
            id: apId(),
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            workflowId: mockWorkflow.id,
            workflowVersionId: mockWorkflowVersion.id,
            workspaceId: mockWorkspace.id,
            connectorName,
            connectorVersion,
            triggerName,
            type: TriggerStrategy.WEBHOOK,
            simulate: false,
            schedule: null,
            deleted: null,
        }])

        const interactionSpy = vi.spyOn(userInteractionWatcher, 'submitAndWaitForResponse').mockResolvedValue({
            status: EngineResponseStatus.OK,
            response: {
                response: {
                    status: StatusCodes.OK,
                    body: { challenge: 'test-challenge' },
                },
            },
            error: undefined,
        })

        const response = await app?.inject({
            method: 'GET',
            url: `/api/v1/webhooks/${mockWorkflow.id}?hub_challenge=test-challenge`,
        })

        expect(response?.statusCode).toBe(StatusCodes.OK)
        expect(interactionSpy).toHaveBeenCalled()

        interactionSpy.mockRestore()
    })

    it('should process handshake for ENABLED workflow on re-verification ping', async () => {
        const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()

        const triggerName = 'new_webhook'
        const connectorName = 'test-handshake-connector-enabled'
        const connectorVersion = '1.0.0'

        const mockConnector = createMockConnectorMetadata({
            tenantId: mockTenant.id,
            connectorType: ConnectorType.CUSTOM,
            name: connectorName,
            version: connectorVersion,
            triggers: {
                [triggerName]: {
                    handshakeConfiguration: {
                        strategy: WebhookHandshakeStrategy.QUERY_PRESENT,
                        paramName: 'hub_challenge',
                    },
                },
            },
        })
        await db.save('connector_metadata', [mockConnector])

        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.ENABLED,
        })
        await db.save('workflow', [mockWorkflow])

        const mockWorkflowVersion = createMockWorkflowVersion({ workflowId: mockWorkflow.id })
        await db.save('workflow_version', [mockWorkflowVersion])
        await db.update('workflow', mockWorkflow.id, { publishedVersionId: mockWorkflowVersion.id })

        await db.save('trigger_source', [{
            id: apId(),
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            workflowId: mockWorkflow.id,
            workflowVersionId: mockWorkflowVersion.id,
            workspaceId: mockWorkspace.id,
            connectorName,
            connectorVersion,
            triggerName,
            type: TriggerStrategy.WEBHOOK,
            simulate: false,
            schedule: null,
            deleted: null,
        }])

        const interactionSpy = vi.spyOn(userInteractionWatcher, 'submitAndWaitForResponse').mockResolvedValue({
            status: EngineResponseStatus.OK,
            response: {
                response: {
                    status: StatusCodes.OK,
                    body: { challenge: 'test-challenge' },
                },
            },
            error: undefined,
        })

        const response = await app?.inject({
            method: 'GET',
            url: `/api/v1/webhooks/${mockWorkflow.id}?hub_challenge=test-challenge`,
        })

        expect(response?.statusCode).toBe(StatusCodes.OK)
        expect(interactionSpy).toHaveBeenCalled()

        interactionSpy.mockRestore()
    })

    it('should accept webhook on test endpoint without execution', async () => {
        const { mockWorkspace, mockTenant, mockOwner } = await mockAndSaveBasicSetup()
        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
            status: WorkflowStatus.DISABLED,
        })
        await db.save('workflow', [mockWorkflow])
        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
        })
        await db.save('workflow_version', [mockWorkflowVersion])
        const mockToken = await generateMockToken({
            type: PrincipalType.USER,
            tenant: {
                id: mockTenant.id,
            },
            id: mockOwner.id,
        })
        const response = await app?.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${mockWorkflow.id}/test`,
            headers: {
                authorization: `Bearer ${mockToken}`,
            },
            body: { test: true },
        })
        expect(response?.statusCode).toBe(StatusCodes.OK)
    })
})
