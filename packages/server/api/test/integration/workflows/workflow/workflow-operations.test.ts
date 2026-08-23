import {
    WorkflowActionType,
    workflowOperations,
    WorkflowOperationType,
    WorkflowStatus,
    WorkflowTriggerType,
    WorkflowVersion,
    WorkflowVersionState,
    PackageType,
    ConnectorType,
    PopulatedWorkflow,
    StepLocationRelativeToParent,
} from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../../../helpers/db'
import { describeWithAuth } from '../../../../helpers/describe-with-auth'
import {
    createMockWorkflow,
    createMockWorkflowVersion,
    createMockFolder,
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

describe('Workflow Operations API', () => {
    describeWithAuth('GET /v1/workflows/:id', () => app!, (setup) => {
        it('should get a workflow by id', async () => {
            const ctx = await setup()

            const mockWorkflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({ workflowId: mockWorkflow.id })
            await db.save('workflow_version', mockWorkflowVersion)

            const response = await ctx.get(`/v1/workflows/${mockWorkflow.id}`)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.id).toBe(mockWorkflow.id)
            expect(body.workspaceId).toBe(ctx.workspace.id)
            expect(body.version).toBeDefined()
            expect(body.version.id).toBe(mockWorkflowVersion.id)
        })

        it('should return 404 for non-existent workflow', async () => {
            const ctx = await setup()

            const response = await ctx.get('/v1/workflows/nonExistentId12345678')

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('GET /v1/workflows/:id (Cross-workspace)', () => {
        it('should deny access for workflow in another workspace', async () => {
            const ctx1 = await createTestContext(app!)
            const ctx2 = await createTestContext(app!)

            const mockWorkflow = createMockWorkflow({ workspaceId: ctx1.workspace.id })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({ workflowId: mockWorkflow.id })
            await db.save('workflow_version', mockWorkflowVersion)

            const response = await ctx2.get(`/v1/workflows/${mockWorkflow.id}`)

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        })
    })

    describeWithAuth('GET /v1/workflows/count', () => app!, (setup) => {
        it('should count workflows in workspace', async () => {
            const ctx = await setup()

            const mockWorkflow1 = createMockWorkflow({ workspaceId: ctx.workspace.id })
            const mockWorkflow2 = createMockWorkflow({ workspaceId: ctx.workspace.id })
            await db.save('workflow', [mockWorkflow1, mockWorkflow2])

            const mockWorkflowVersion1 = createMockWorkflowVersion({ workflowId: mockWorkflow1.id })
            const mockWorkflowVersion2 = createMockWorkflowVersion({ workflowId: mockWorkflow2.id })
            await db.save('workflow_version', [mockWorkflowVersion1, mockWorkflowVersion2])

            const response = await ctx.get('/v1/workflows/count', {
                workspaceId: ctx.workspace.id,
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body).toBe(2)
        })
    })

    describeWithAuth('DELETE /v1/workflows/:id', () => app!, (setup) => {
        it('should delete a workflow', async () => {
            const ctx = await setup()

            const mockWorkflow = createMockWorkflow({ workspaceId: ctx.workspace.id, status: WorkflowStatus.DISABLED })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({ workflowId: mockWorkflow.id })
            await db.save('workflow_version', mockWorkflowVersion)

            const response = await ctx.delete(`/v1/workflows/${mockWorkflow.id}`)

            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)

            // Verify the workflow no longer appears in list
            const listResponse = await ctx.get('/v1/workflows', { workspaceId: ctx.workspace.id })
            const workflows = listResponse?.json().data ?? []
            const workflowIds = workflows.map((f: Record<string, string>) => f.id)
            expect(workflowIds).not.toContain(mockWorkflow.id)
        })

        it('should return 404 when deleting non-existent workflow', async () => {
            const ctx = await setup()

            const response = await ctx.delete('/v1/workflows/nonExistentId12345678')

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('DELETE /v1/workflows/:id (Cross-workspace)', () => {
        it('should deny deleting workflow from another workspace', async () => {
            const ctx1 = await createTestContext(app!)
            const ctx2 = await createTestContext(app!)

            const mockWorkflow = createMockWorkflow({ workspaceId: ctx1.workspace.id, status: WorkflowStatus.DISABLED })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({ workflowId: mockWorkflow.id })
            await db.save('workflow_version', mockWorkflowVersion)

            const response = await ctx2.delete(`/v1/workflows/${mockWorkflow.id}`)

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        })
    })

    describeWithAuth('POST /v1/workflows/:id CHANGE_NAME', () => app!, (setup) => {
        it('should rename a workflow', async () => {
            const ctx = await setup()

            const createResponse = await ctx.post('/v1/workflows', {
                displayName: 'Original Name',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })

            expect(createResponse?.statusCode).toBe(StatusCodes.CREATED)
            const workflow: PopulatedWorkflow = createResponse?.json()

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.CHANGE_NAME,
                request: { displayName: 'New Name' },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.version.displayName).toBe('New Name')
        })
    })

    describe('POST /v1/workflows/:id CHANGE_FOLDER', () => {
        it('should move workflow to folder', async () => {
            const ctx = await createTestContext(app!)

            const mockFolder = createMockFolder({ workspaceId: ctx.workspace.id })
            await db.save('folder', mockFolder)

            const createResponse = await ctx.post('/v1/workflows', {
                displayName: 'test workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })

            const workflow: PopulatedWorkflow = createResponse?.json()

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.CHANGE_FOLDER,
                request: { folderId: mockFolder.id },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.folderId).toBe(mockFolder.id)
        })

        it('should move workflow to null (unfolder)', async () => {
            const ctx = await createTestContext(app!)

            const mockFolder = createMockFolder({ workspaceId: ctx.workspace.id })
            await db.save('folder', mockFolder)

            const createResponse = await ctx.post('/v1/workflows', {
                displayName: 'test workflow',
                workspaceId: ctx.workspace.id,
                folderId: mockFolder.id,
            }, { query: { workspaceId: ctx.workspace.id } })

            const workflow: PopulatedWorkflow = createResponse?.json()

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.CHANGE_FOLDER,
                request: { folderId: null },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.folderId).toBeNull()
        })
    })

    describe('POST /v1/workflows/:id UPDATE_TRIGGER', () => {
        it('should update trigger to connector trigger', async () => {
            const ctx = await createTestContext(app!)

            const mockConnector = createMockConnectorMetadata({
                name: '@fema/connector-schedule',
                version: '0.2.0',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
            })
            await db.save('connector_metadata', mockConnector)

            const createResponse = await ctx.post('/v1/workflows', {
                displayName: 'test workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })

            const workflow: PopulatedWorkflow = createResponse?.json()

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.UPDATE_TRIGGER,
                request: {
                    type: WorkflowTriggerType.CONNECTOR,
                    settings: {
                        connectorName: '@fema/connector-schedule',
                        connectorVersion: '0.2.0',
                        input: {},
                        triggerName: 'every_hour',
                        propertySettings: {},
                    },
                    valid: false,
                    name: 'trigger',
                    displayName: 'Schedule',
                },
            })
            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.version.trigger.type).toBe(WorkflowTriggerType.CONNECTOR)
            expect(body.version.trigger.settings.connectorName).toBe('@fema/connector-schedule')
        })
    })

    describeWithAuth('POST /v1/workflows/:id ADD_ACTION', () => app!, (setup) => {
        it('should add code action after trigger', async () => {
            const ctx = await setup()

            const createResponse = await ctx.post('/v1/workflows', {
                displayName: 'test workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })

            const workflow: PopulatedWorkflow = createResponse?.json()

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    parentStep: 'trigger',
                    action: {
                        type: WorkflowActionType.CODE,
                        displayName: 'Code Step',
                        name: 'step_1',
                        settings: {
                            input: {},
                            sourceCode: {
                                code: 'export const code = async () => { return true; }',
                                packageJson: '{}',
                            },
                        },
                        valid: true,
                        skip: false,
                    },
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.version.trigger.nextAction).toBeDefined()
            expect(body.version.trigger.nextAction.type).toBe(WorkflowActionType.CODE)
            expect(body.version.trigger.nextAction.displayName).toBe('Code Step')
        })
    })

    describe('POST /v1/workflows/:id UPDATE_ACTION', () => {
        it('should update action settings', async () => {
            const ctx = await createTestContext(app!)

            const createResponse = await ctx.post('/v1/workflows', {
                displayName: 'test workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })
            const workflow: PopulatedWorkflow = createResponse?.json()

            await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    parentStep: 'trigger',
                    action: {
                        type: WorkflowActionType.CODE,
                        displayName: 'Code Step',
                        name: 'step_1',
                        settings: {
                            input: {},
                            sourceCode: {
                                code: 'export const code = async () => { return true; }',
                                packageJson: '{}',
                            },
                        },
                        valid: true,
                        skip: false,
                    },
                },
            })

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.UPDATE_ACTION,
                request: {
                    type: WorkflowActionType.CODE,
                    displayName: 'Updated Code Step',
                    name: 'step_1',
                    settings: {
                        input: { key: 'value' },
                        sourceCode: {
                            code: 'export const code = async () => { return false; }',
                            packageJson: '{}',
                        },
                    },
                    valid: true,
                    skip: false,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.version.trigger.nextAction.displayName).toBe('Updated Code Step')
        })

        it('should preserve settings.input for CODE action', async () => {
            const ctx = await createTestContext(app!)

            const createResponse = await ctx.post('/v1/workflows', {
                displayName: 'test workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })
            const workflow: PopulatedWorkflow = createResponse?.json()

            await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    parentStep: 'trigger',
                    action: {
                        type: WorkflowActionType.CODE,
                        displayName: 'Code Step',
                        name: 'step_1',
                        settings: {
                            input: {},
                            sourceCode: {
                                code: 'export const code = async () => { return true; }',
                                packageJson: '{}',
                            },
                        },
                        valid: true,
                        skip: false,
                    },
                },
            })

            const inputData = { key: 'value', nested: { a: 1 } }
            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.UPDATE_ACTION,
                request: {
                    type: WorkflowActionType.CODE,
                    displayName: 'Code Step',
                    name: 'step_1',
                    settings: {
                        input: inputData,
                        sourceCode: {
                            code: 'export const code = async () => { return true; }',
                            packageJson: '{}',
                        },
                    },
                    valid: true,
                    skip: false,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.version.trigger.nextAction.settings.input).toEqual(inputData)
        })

        it('should preserve settings.input for CONNECTOR action', async () => {
            const ctx = await createTestContext(app!)

            const mockConnector = createMockConnectorMetadata({
                name: '@fema/connector-test',
                version: '0.1.0',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
            })
            await db.save('connector_metadata', mockConnector)

            const createResponse = await ctx.post('/v1/workflows', {
                displayName: 'test workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })
            const workflow: PopulatedWorkflow = createResponse?.json()

            await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    parentStep: 'trigger',
                    action: {
                        type: WorkflowActionType.CONNECTOR,
                        displayName: 'Connector Step',
                        name: 'step_1',
                        settings: {
                            connectorName: '@fema/connector-test',
                            connectorVersion: '0.1.0',
                            actionName: 'test_action',
                            input: {},
                            propertySettings: {},
                        },
                        valid: true,
                        skip: false,
                    },
                },
            })

            const inputData = { field1: 'hello', field2: '{{ trigger.body }}' }
            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.UPDATE_ACTION,
                request: {
                    type: WorkflowActionType.CONNECTOR,
                    displayName: 'Connector Step',
                    name: 'step_1',
                    settings: {
                        connectorName: '@fema/connector-test',
                        connectorVersion: '0.1.0',
                        actionName: 'test_action',
                        input: inputData,
                        propertySettings: {},
                    },
                    valid: true,
                    skip: false,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.version.trigger.nextAction.settings.input).toEqual(inputData)
        })
    })

    describe('POST /v1/workflows/:id DELETE_ACTION', () => {
        it('should delete action by name', async () => {
            const ctx = await createTestContext(app!)

            const createResponse = await ctx.post('/v1/workflows', {
                displayName: 'test workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })
            const workflow: PopulatedWorkflow = createResponse?.json()

            await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    parentStep: 'trigger',
                    action: {
                        type: WorkflowActionType.CODE,
                        displayName: 'Code Step',
                        name: 'step_1',
                        settings: {
                            input: {},
                            sourceCode: {
                                code: 'export const code = async () => { return true; }',
                                packageJson: '{}',
                            },
                        },
                        valid: true,
                        skip: false,
                    },
                },
            })

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.DELETE_ACTION,
                request: { names: ['step_1'] },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.version.trigger.nextAction).toBeUndefined()
        })
    })

    describe('POST /v1/workflows/:id DUPLICATE_ACTION', () => {
        it('should duplicate an action', async () => {
            const ctx = await createTestContext(app!)

            const createResponse = await ctx.post('/v1/workflows', {
                displayName: 'test workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })
            const workflow: PopulatedWorkflow = createResponse?.json()

            await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    parentStep: 'trigger',
                    action: {
                        type: WorkflowActionType.CODE,
                        displayName: 'Code Step',
                        name: 'step_1',
                        settings: {
                            input: {},
                            sourceCode: {
                                code: 'export const code = async () => { return true; }',
                                packageJson: '{}',
                            },
                        },
                        valid: true,
                        skip: false,
                    },
                },
            })

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.DUPLICATE_ACTION,
                request: { stepName: 'step_1' },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.version.trigger.nextAction).toBeDefined()
            expect(body.version.trigger.nextAction.nextAction).toBeDefined()
        })
    })

    describe('POST /v1/workflows/:id MOVE_ACTION', () => {
        it('should move action to different position', async () => {
            const ctx = await createTestContext(app!)

            const createResponse = await ctx.post('/v1/workflows', {
                displayName: 'test workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })
            const workflow: PopulatedWorkflow = createResponse?.json()

            await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    parentStep: 'trigger',
                    action: {
                        type: WorkflowActionType.CODE,
                        displayName: 'Step 1',
                        name: 'step_1',
                        settings: {
                            input: {},
                            sourceCode: {
                                code: 'export const code = async () => { return 1; }',
                                packageJson: '{}',
                            },
                        },
                        valid: true,
                        skip: false,
                    },
                },
            })

            await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    parentStep: 'step_1',
                    stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
                    action: {
                        type: WorkflowActionType.CODE,
                        displayName: 'Step 2',
                        name: 'step_2',
                        settings: {
                            input: {},
                            sourceCode: {
                                code: 'export const code = async () => { return 2; }',
                                packageJson: '{}',
                            },
                        },
                        valid: true,
                        skip: false,
                    },
                },
            })

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.MOVE_ACTION,
                request: {
                    name: 'step_2',
                    newParentStep: 'trigger',
                    stepLocationRelativeToNewParent: StepLocationRelativeToParent.AFTER,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.version.trigger.nextAction.displayName).toBe('Step 2')
        })
    })

    describe('POST /v1/workflows/:id IMPORT_WORKFLOW', () => {
        it('should import workflow definition', async () => {
            const ctx = await createTestContext(app!)

            const createResponse = await ctx.post('/v1/workflows', {
                displayName: 'test workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })
            const workflow: PopulatedWorkflow = createResponse?.json()

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.IMPORT_WORKFLOW,
                request: {
                    displayName: 'Imported Workflow',
                    trigger: {
                        type: WorkflowTriggerType.EMPTY,
                        name: 'trigger',
                        settings: {},
                        valid: false,
                        displayName: 'Select Trigger',
                    },
                    schemaVersion: null,
                    notes: null,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.version.displayName).toBe('Imported Workflow')
            expect(body.version.state).toBe(WorkflowVersionState.DRAFT)
        })

        it('rejects an imported workflow whose nested step name is a path traversal', async () => {
            const ctx = await createTestContext(app!)

            const createResponse = await ctx.post('/v1/workflows', {
                displayName: 'test workflow',
                workspaceId: ctx.workspace.id,
            }, { query: { workspaceId: ctx.workspace.id } })
            const workflow: PopulatedWorkflow = createResponse?.json()

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.IMPORT_WORKFLOW,
                request: {
                    displayName: 'Malicious Workflow',
                    trigger: {
                        type: WorkflowTriggerType.EMPTY,
                        name: 'trigger',
                        displayName: 'Select Trigger',
                        settings: {},
                        valid: false,
                        nextAction: {
                            type: WorkflowActionType.CODE,
                            displayName: 'Code Step',
                            name: '../../common/node_modules/bufferutil',
                            settings: {
                                input: {},
                                sourceCode: {
                                    code: 'export const code = async () => { return true; }',
                                    packageJson: '{}',
                                },
                            },
                            valid: true,
                            skip: false,
                        },
                    },
                    schemaVersion: null,
                    notes: null,
                },
            })

            // ErrorCode.VALIDATION maps to 409 in the API error handler (the convention for
            // rejected-invalid-input across the codebase); the point is the import is rejected
            // and the traversal name is never persisted.
            expect(response?.statusCode).toBe(StatusCodes.CONFLICT)

            // The traversal step must never reach the workflow version.
            const afterImport = await ctx.get(`/v1/workflows/${workflow.id}`)
            const persisted: PopulatedWorkflow = afterImport?.json()
            expect(persisted.version.trigger.nextAction).toBeUndefined()
        })
    })

    describe('POST /v1/workflows/:id draft creation rollback', () => {
        it('should not leave an orphaned empty draft when importing into the new draft fails', async () => {
            const ctx = await createTestContext(app!)

            const mockWorkflow = createMockWorkflow({
                workspaceId: ctx.workspace.id,
                status: WorkflowStatus.DISABLED,
            })
            await db.save('workflow', mockWorkflow)

            const lockedVersion = createMockWorkflowVersion({
                workflowId: mockWorkflow.id,
                state: WorkflowVersionState.LOCKED,
                valid: true,
            })
            await db.save('workflow_version', lockedVersion)

            const applySpy = vi.spyOn(workflowOperations, 'apply').mockImplementationOnce(() => {
                throw new RangeError('Maximum call stack size exceeded')
            })

            try {
                const response = await ctx.post(`/v1/workflows/${mockWorkflow.id}`, {
                    type: WorkflowOperationType.CHANGE_NAME,
                    request: { displayName: 'New Name' },
                })

                expect(response?.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)

                const orphanedDraft = await db.findOneBy('workflow_version', {
                    workflowId: mockWorkflow.id,
                    state: WorkflowVersionState.DRAFT,
                })
                expect(orphanedDraft).toBeNull()

                const remainingVersion = await db.findOneByOrFail<WorkflowVersion>('workflow_version', {
                    workflowId: mockWorkflow.id,
                })
                expect(remainingVersion.id).toBe(lockedVersion.id)
                expect(remainingVersion.state).toBe(WorkflowVersionState.LOCKED)
            }
            finally {
                applySpy.mockRestore()
            }
        })

        it('should delete the newly created draft when the user operation fails after a successful import', async () => {
            const ctx = await createTestContext(app!)

            const mockWorkflow = createMockWorkflow({
                workspaceId: ctx.workspace.id,
                status: WorkflowStatus.DISABLED,
            })
            await db.save('workflow', mockWorkflow)

            const lockedVersion = createMockWorkflowVersion({
                workflowId: mockWorkflow.id,
                state: WorkflowVersionState.LOCKED,
                valid: true,
            })
            await db.save('workflow_version', lockedVersion)

            const originalApply = workflowOperations.apply
            const applySpy = vi.spyOn(workflowOperations, 'apply').mockImplementation((workflowVersion, operation) => {
                if (operation.type === WorkflowOperationType.CHANGE_NAME && operation.request.displayName === 'Renamed by user') {
                    throw new Error('user operation failed')
                }
                return originalApply(workflowVersion, operation)
            })

            try {
                const response = await ctx.post(`/v1/workflows/${mockWorkflow.id}`, {
                    type: WorkflowOperationType.CHANGE_NAME,
                    request: { displayName: 'Renamed by user' },
                })

                expect(response?.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)

                const leftoverDraft = await db.findOneBy('workflow_version', {
                    workflowId: mockWorkflow.id,
                    state: WorkflowVersionState.DRAFT,
                })
                expect(leftoverDraft).toBeNull()

                const remainingVersion = await db.findOneByOrFail<WorkflowVersion>('workflow_version', {
                    workflowId: mockWorkflow.id,
                })
                expect(remainingVersion.id).toBe(lockedVersion.id)
                expect(remainingVersion.state).toBe(WorkflowVersionState.LOCKED)
            }
            finally {
                applySpy.mockRestore()
            }
        })
    })

    describe('GET /v1/workflows/:workflowId/versions', () => {
        it('should list workflow versions', async () => {
            const ctx = await createTestContext(app!)

            const mockWorkflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
            await db.save('workflow', mockWorkflow)

            const mockWorkflowVersion = createMockWorkflowVersion({
                workflowId: mockWorkflow.id,
                state: WorkflowVersionState.DRAFT,
            })
            await db.save('workflow_version', mockWorkflowVersion)

            const response = await ctx.get(`/v1/workflows/${mockWorkflow.id}/versions`)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.data).toHaveLength(1)
            expect(body.data[0].id).toBe(mockWorkflowVersion.id)
        })
    })
})
