import { WebhookRenewStrategy } from '@fema/connector-sdk'
import {
    WorkflowOperationType,
    WorkflowStatus,
    WorkflowTriggerType,
    WorkflowVersionState,
    PackageType,
    ConnectorType,
    PopulatedWorkflow,
    PrincipalType,
    PropertyExecutionType,
    TriggerStrategy,
    TriggerTestStrategy,
    WebhookHandshakeStrategy,
} from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { generateMockToken } from '../../../../helpers/auth'
import { db } from '../../../../helpers/db'
import {
    createMockWorkflow,
    createMockWorkflowVersion,
    createMockConnectorMetadata,
} from '../../../../helpers/mocks'
import { createTestContext } from '../../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Workflow API', () => {
    describe('Create Workflow endpoint', () => {
        it('Adds an empty workflow', async () => {
            const ctx = await createTestContext(app!)

            const response = await ctx.post('/v1/workflows', {
                displayName: 'test workflow',
                workspaceId: ctx.workspace.id,
                metadata: { foo: 'bar' },
            }, { query: { workspaceId: ctx.workspace.id } })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            const responseBody = response?.json()

            expect(Object.keys(responseBody)).toHaveLength(15)
            expect(responseBody?.id).toHaveLength(21)
            expect(responseBody?.created).toBeDefined()
            expect(responseBody?.updated).toBeDefined()
            expect(responseBody?.workspaceId).toBe(ctx.workspace.id)
            expect(responseBody?.folderId).toBeNull()
            expect(responseBody?.status).toBe('DISABLED')
            expect(responseBody?.publishedVersionId).toBeNull()
            expect(responseBody?.metadata).toMatchObject({ foo: 'bar' })
            expect(responseBody?.operationStatus).toBeDefined()
            expect(responseBody?.templateId).toBeNull()
            expect(responseBody?.createdBy).toBeNull()

            expect(Object.keys(responseBody?.version)).toHaveLength(14)
            expect(responseBody?.version?.id).toHaveLength(21)
            expect(responseBody?.version?.created).toBeDefined()
            expect(responseBody?.version?.updated).toBeDefined()
            expect(responseBody?.version?.updatedBy).toBeNull()
            expect(responseBody?.version?.workflowId).toBe(responseBody?.id)
            expect(responseBody?.version?.displayName).toBe('test workflow')
            expect(Object.keys(responseBody?.version?.trigger)).toHaveLength(6)
            expect(responseBody?.version?.trigger.type).toBe('EMPTY')
            expect(responseBody?.version?.trigger.name).toBe('trigger')
            expect(responseBody?.version?.trigger.settings).toMatchObject({})
            expect(responseBody?.version?.trigger.valid).toBe(false)
            expect(responseBody?.version?.trigger.displayName).toBe('Select Trigger')
            expect(responseBody?.version?.valid).toBe(false)
            expect(responseBody?.version?.state).toBe('DRAFT')
        })
    })

    describe('Update status endpoint', () => {
        it('Enables a disabled Workflow', async () => {
            const ctx = await createTestContext(app!)

            const mockConnectorMetadata1 = createMockConnectorMetadata({
                name: '@fema/connector-schedule',
                version: '0.1.5',
                triggers: {
                    every_hour: {
                        name: 'every_hour',
                        displayName: 'Every Hour',
                        description: 'Triggers the current workflow every hour',
                        requireAuth: false,
                        props: {},
                        type: TriggerStrategy.POLLING,
                        sampleData: {},
                        testStrategy: TriggerTestStrategy.TEST_FUNCTION,
                    },
                },
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
            })
            await db.save('connector_metadata', mockConnectorMetadata1)

            const mockWorkflow = createMockWorkflow({
                workspaceId: ctx.workspace.id,
                status: WorkflowStatus.DISABLED,
            })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({
                workflowId: mockWorkflow.id,
                updatedBy: ctx.user.id,
                trigger: {
                    type: WorkflowTriggerType.CONNECTOR,
                    settings: {
                        connectorName: '@fema/connector-schedule',
                        connectorVersion: '0.1.5',
                        input: { run_on_weekends: false },
                        triggerName: 'every_hour',
                        propertySettings: {
                            run_on_weekends: { type: PropertyExecutionType.MANUAL },
                        },
                    },
                    valid: true,
                    name: 'trigger',
                    displayName: 'Schedule',
                    lastUpdatedDate: new Date().toISOString(),
                },
            })
            await db.save('workflow_version', mockWorkflowVersion)
            await db.update('workflow', mockWorkflow.id, { publishedVersionId: mockWorkflowVersion.id })

            const response = await ctx.post(`/v1/workflows/${mockWorkflow.id}`, {
                type: WorkflowOperationType.CHANGE_STATUS,
                request: { status: 'ENABLED' },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const responseBody: PopulatedWorkflow | undefined = response?.json()
            expect(responseBody).toBeDefined()
            if (responseBody) {
                expect(responseBody.id).toBe(mockWorkflow.id)
                expect(responseBody.created).toBeDefined()
                expect(responseBody.updated).toBeDefined()
                expect(responseBody.workspaceId).toBe(ctx.workspace.id)
                expect(responseBody.folderId).toBeNull()
                expect(responseBody.publishedVersionId).toBe(mockWorkflowVersion.id)
                expect(responseBody.metadata).toBeNull()
                expect(Object.keys(responseBody.version)).toHaveLength(14)
                expect(responseBody.version.id).toBe(mockWorkflowVersion.id)
            }
        })

        it('Disables an enabled Workflow', async () => {
            const ctx = await createTestContext(app!)

            const mockWorkflow = createMockWorkflow({
                workspaceId: ctx.workspace.id,
                status: WorkflowStatus.ENABLED,
            })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({
                workflowId: mockWorkflow.id,
                updatedBy: ctx.user.id,
            })
            await db.save('workflow_version', mockWorkflowVersion)
            await db.update('workflow', mockWorkflow.id, { publishedVersionId: mockWorkflowVersion.id })

            const response = await ctx.post(`/v1/workflows/${mockWorkflow.id}`, {
                type: WorkflowOperationType.CHANGE_STATUS,
                request: { status: 'DISABLED' },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const responseBody = response?.json()

            expect(responseBody?.id).toBe(mockWorkflow.id)
            expect(responseBody?.created).toBeDefined()
            expect(responseBody?.updated).toBeDefined()
            expect(responseBody?.workspaceId).toBe(ctx.workspace.id)
            expect(responseBody?.folderId).toBeNull()
            expect(responseBody?.status).toBe('DISABLED')
            expect(responseBody?.publishedVersionId).toBe(mockWorkflowVersion.id)
            expect(responseBody?.metadata).toBeNull()
            expect(responseBody?.templateId).toBeNull()
            expect(Object.keys(responseBody?.version)).toHaveLength(14)
            expect(responseBody?.version?.id).toBe(mockWorkflowVersion.id)
        })
    })

    describe('Update published version id endpoint', () => {
        it('Publishes latest draft version', async () => {
            const ctx = await createTestContext(app!)

            const mockConnectorMetadata1 = createMockConnectorMetadata({
                name: '@fema/connector-schedule',
                version: '0.1.5',
                triggers: {
                    every_hour: {
                        name: 'every_hour',
                        displayName: 'Every Hour',
                        description: 'Triggers the current workflow every hour',
                        requireAuth: true,
                        props: {},
                        type: TriggerStrategy.WEBHOOK,
                        handshakeConfiguration: { strategy: WebhookHandshakeStrategy.NONE },
                        renewConfiguration: { strategy: WebhookRenewStrategy.NONE },
                        sampleData: {},
                        testStrategy: TriggerTestStrategy.TEST_FUNCTION,
                    },
                },
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
            })
            await db.save('connector_metadata', mockConnectorMetadata1)

            const mockWorkflow = createMockWorkflow({
                workspaceId: ctx.workspace.id,
                status: WorkflowStatus.DISABLED,
            })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({
                workflowId: mockWorkflow.id,
                updatedBy: ctx.user.id,
                state: WorkflowVersionState.DRAFT,
                trigger: {
                    type: WorkflowTriggerType.CONNECTOR,
                    settings: {
                        connectorName: '@fema/connector-schedule',
                        connectorVersion: '0.1.5',
                        input: { run_on_weekends: false },
                        triggerName: 'every_hour',
                        propertySettings: {
                            run_on_weekends: { type: PropertyExecutionType.MANUAL },
                        },
                    },
                    valid: true,
                    name: 'trigger',
                    displayName: 'Schedule',
                    lastUpdatedDate: new Date().toISOString(),
                },
            })
            await db.save('workflow_version', mockWorkflowVersion)

            const response = await ctx.post(`/v1/workflows/${mockWorkflow.id}`, {
                type: WorkflowOperationType.LOCK_AND_PUBLISH,
                request: {},
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const responseBody: PopulatedWorkflow | undefined = response?.json()
            expect(responseBody).toBeDefined()
            if (responseBody) {
                expect(responseBody.id).toBe(mockWorkflow.id)
                expect(responseBody.created).toBeDefined()
                expect(responseBody.updated).toBeDefined()
                expect(responseBody.workspaceId).toBe(ctx.workspace.id)
                expect(responseBody.folderId).toBeNull()
                expect(responseBody.status).toBe('ENABLED')
                expect(responseBody.publishedVersionId).toBe(mockWorkflowVersion.id)
                expect(responseBody.metadata).toBeNull()
                expect(Object.keys(responseBody.version)).toHaveLength(14)
                expect(responseBody.version.id).toBe(mockWorkflowVersion.id)
                expect(responseBody.version.state).toBe('LOCKED')
                expect(responseBody.templateId).toBeNull()
            }
        })
    })

    describe('List Workflows endpoint', () => {
        it('Filters Workflows by status', async () => {
            const ctx = await createTestContext(app!)

            const mockEnabledWorkflow = createMockWorkflow({
                workspaceId: ctx.workspace.id,
                status: WorkflowStatus.ENABLED,
            })
            const mockDisabledWorkflow = createMockWorkflow({
                workspaceId: ctx.workspace.id,
                status: WorkflowStatus.DISABLED,
            })
            await db.save('workflow', [mockEnabledWorkflow, mockDisabledWorkflow])

            const mockEnabledWorkflowVersion = createMockWorkflowVersion({ workflowId: mockEnabledWorkflow.id })
            const mockDisabledWorkflowVersion = createMockWorkflowVersion({ workflowId: mockDisabledWorkflow.id })
            await db.save('workflow_version', [mockEnabledWorkflowVersion, mockDisabledWorkflowVersion])

            const response = await ctx.get('/v1/workflows', {
                workspaceId: ctx.workspace.id,
                status: 'ENABLED',
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const responseBody = response?.json()

            expect(responseBody.data).toHaveLength(1)
            expect(responseBody.data[0].id).toBe(mockEnabledWorkflow.id)
        })

        it('Populates Workflow version', async () => {
            const ctx = await createTestContext(app!)

            const mockWorkflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({ workflowId: mockWorkflow.id })
            await db.save('workflow_version', mockWorkflowVersion)

            const response = await ctx.get('/v1/workflows', { workspaceId: ctx.workspace.id })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const responseBody = response?.json()

            expect(responseBody?.data).toHaveLength(1)
            expect(responseBody?.data?.[0]?.id).toBe(mockWorkflow.id)
            expect(responseBody?.data?.[0]?.version?.id).toBe(mockWorkflowVersion.id)
        })

        it('Fails if a workflow with no version exists', async () => {
            const ctx = await createTestContext(app!)

            const mockWorkflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
            await db.save('workflow', mockWorkflow)

            const response = await ctx.get('/v1/workflows', { workspaceId: ctx.workspace.id })

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
            const responseBody = response?.json()

            expect(responseBody?.code).toBe('ENTITY_NOT_FOUND')
            expect(responseBody?.params?.entityType).toBe('WorkflowVersion')
            expect(responseBody?.params?.message).toBe(`workflowId=${mockWorkflow.id}`)
        })
    })

    describe('Update Metadata endpoint', () => {
        it('Updates workflow metadata', async () => {
            const ctx = await createTestContext(app!)

            const mockWorkflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({ workflowId: mockWorkflow.id })
            await db.save('workflow_version', mockWorkflowVersion)

            const updatedMetadata = { foo: 'bar' }

            const response = await ctx.post(`/v1/workflows/${mockWorkflow.id}`, {
                type: WorkflowOperationType.UPDATE_METADATA,
                request: { metadata: updatedMetadata },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const responseBody = response?.json()

            expect(responseBody.id).toBe(mockWorkflow.id)
            expect(responseBody.metadata).toEqual(updatedMetadata)

            const updatedWorkflow = await db.findOneBy('workflow', { id: mockWorkflow.id })
            expect((updatedWorkflow as Record<string, unknown>)?.metadata).toEqual(updatedMetadata)
        })
    })

    describe('Export Workflow Template endpoint', () => {
        it('Exports a workflow template using an API key', async () => {
            const ctx = await createTestContext(app!)

            const mockWorkflow = createMockWorkflow({
                workspaceId: ctx.workspace.id,
                status: WorkflowStatus.ENABLED,
            })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({
                workflowId: mockWorkflow.id,
                updatedBy: ctx.user.id,
            })
            await db.save('workflow_version', mockWorkflowVersion)

            const mockApiKey = 'test_api_key'
            const mockToken = await generateMockToken({
                type: PrincipalType.SERVICE,
                id: mockApiKey,
                tenant: { id: ctx.tenant.id },
            })

            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/workflows/${mockWorkflow.id}/template`,
                headers: { authorization: `Bearer ${mockToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const responseBody = response?.json()

            expect(responseBody).toHaveProperty('name')
            expect(responseBody).toHaveProperty('description')
            expect(responseBody).toHaveProperty('workflows')
            expect(responseBody.workflows).toHaveLength(1)
            expect(responseBody.workflows[0]).toHaveProperty('trigger')
        })
    })
})
