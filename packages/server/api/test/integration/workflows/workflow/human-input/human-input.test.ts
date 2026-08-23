import { apId } from '@fema-ipaas/core-utils'
import { WorkflowStatus, WorkflowTriggerType, WorkflowVersionState, PackageType, ConnectorType } from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../../../../src/app/database/database-connection'
import { connectorCache } from '../../../../../../src/app/connectors/metadata/connector-cache'
import { db } from '../../../../../helpers/db'
import {
    createMockWorkflow,
    createMockWorkflowVersion,
    createMockConnectorMetadata,
} from '../../../../../helpers/mocks'
import { createTestContext } from '../../../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../../../helpers/test-setup'

let app: FastifyInstance | null = null
let mockLog: FastifyBaseLogger

beforeAll(async () => {
    app = await setupTestEnvironment()
    mockLog = app!.log!
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Human Input API', () => {
    describe('GET /v1/human-input/form/:workflowId', () => {
        it('should return form config for workflow with form trigger', async () => {
            const ctx = await createTestContext(app!)

            await databaseConnection().getRepository('connector_metadata').createQueryBuilder().delete().execute()
            const mockConnector = createMockConnectorMetadata({
                name: '@fema-ipaas/connector-forms',
                version: '0.2.0',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const mockWorkflow = createMockWorkflow({
                workspaceId: ctx.workspace.id,
                status: WorkflowStatus.ENABLED,
            })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({
                workflowId: mockWorkflow.id,
                state: WorkflowVersionState.LOCKED,
                trigger: {
                    type: WorkflowTriggerType.CONNECTOR,
                    settings: {
                        connectorName: '@fema-ipaas/connector-forms',
                        connectorVersion: '0.2.0',
                        triggerName: 'form_submission',
                        input: {
                            inputs: [
                                {
                                    displayName: 'Name',
                                    required: true,
                                    description: 'Enter your name',
                                    type: 'text',
                                },
                            ],
                            waitForResponse: false,
                        },
                        propertySettings: {},
                    },
                    valid: true,
                    name: 'trigger',
                    displayName: 'Form Submission',
                },
            })
            await db.save('workflow_version', mockWorkflowVersion)
            await db.update('workflow', mockWorkflow.id, { publishedVersionId: mockWorkflowVersion.id })

            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/human-input/form/${mockWorkflow.id}`,
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.id).toBe(mockWorkflow.id)
            expect(typeof body.title).toBe('string')
            expect(body.props).toEqual(
                expect.objectContaining({
                    inputs: expect.any(Array),
                }),
            )
        })

        it('should return 404 for non-existent workflow', async () => {
            const nonExistentId = apId()
            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/human-input/form/${nonExistentId}`,
            })

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })

        it('should return error for workflow without form trigger', async () => {
            const ctx = await createTestContext(app!)

            const mockWorkflow = createMockWorkflow({
                workspaceId: ctx.workspace.id,
                status: WorkflowStatus.ENABLED,
            })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({
                workflowId: mockWorkflow.id,
                state: WorkflowVersionState.LOCKED,
            })
            await db.save('workflow_version', mockWorkflowVersion)
            await db.update('workflow', mockWorkflow.id, { publishedVersionId: mockWorkflowVersion.id })

            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/human-input/form/${mockWorkflow.id}`,
            })

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('GET /v1/human-input/chat/:workflowId', () => {
        it('should return chat config for workflow with chat trigger', async () => {
            const ctx = await createTestContext(app!)

            await databaseConnection().getRepository('connector_metadata').createQueryBuilder().delete().execute()
            const mockConnector = createMockConnectorMetadata({
                name: '@fema-ipaas/connector-forms',
                version: '0.3.0',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const mockWorkflow = createMockWorkflow({
                workspaceId: ctx.workspace.id,
                status: WorkflowStatus.ENABLED,
            })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({
                workflowId: mockWorkflow.id,
                state: WorkflowVersionState.LOCKED,
                trigger: {
                    type: WorkflowTriggerType.CONNECTOR,
                    settings: {
                        connectorName: '@fema-ipaas/connector-forms',
                        connectorVersion: '0.3.0',
                        triggerName: 'chat_submission',
                        input: {
                            botName: 'Test Bot',
                        },
                        propertySettings: {},
                    },
                    valid: true,
                    name: 'trigger',
                    displayName: 'Chat Submission',
                },
            })
            await db.save('workflow_version', mockWorkflowVersion)
            await db.update('workflow', mockWorkflow.id, { publishedVersionId: mockWorkflowVersion.id })

            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/human-input/chat/${mockWorkflow.id}`,
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.id).toBe(mockWorkflow.id)
            expect(typeof body.title).toBe('string')
            expect(body.props).toEqual(
                expect.objectContaining({
                    botName: 'Test Bot',
                }),
            )
        })

        it('should return 404 for non-existent workflow', async () => {
            const nonExistentId = apId()
            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/human-input/chat/${nonExistentId}`,
            })

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })
})
