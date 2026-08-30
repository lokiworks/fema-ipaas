import { AddressInfo } from 'net'
import { generateId } from '@fema-ipaas/core-utils'
import { ContextVersion, StoreScope } from '@fema-ipaas/connector-sdk'
import { ConnectionStatus, ConnectionType, ConnectionExpiredError, ConnectionNotFoundError, ConnectionConnectorMismatchError, FetchError, WorkflowStatus, WorkflowVersionState, PrincipalType } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { createConnectionResolver } from '../../../../../engine/src/lib/connector-context/connection-resolver'
import { createFileUploader } from '../../../../../engine/src/lib/connector-context/file-uploader'
import { createWorkflowsContext } from '../../../../../engine/src/lib/connector-context/workflows'
import { createContextStore } from '../../../../../engine/src/lib/connector-context/store'
import { encryptUtils } from '../../../../src/app/helper/encryption'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import {
    createMockConnection,
    createMockWorkflow,
    createMockWorkflowVersion,
    mockAndSaveBasicSetup,
} from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null
let apiUrl: string

beforeAll(async () => {
    app = await setupTestEnvironment()
    if (!app.server.listening) {
        await app.listen({ port: 0, host: '127.0.0.1' })
    }
    const port = (app.server.address() as AddressInfo).port
    apiUrl = `http://127.0.0.1:${port}/api/`
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Engine Services Integration', () => {
    let engineToken: string
    let projectId: string
    let tenantId: string
    let ownerId: string

    beforeEach(async () => {
        const { mockTenant, mockProject, mockOwner } = await mockAndSaveBasicSetup()
        projectId = mockProject.id
        tenantId = mockTenant.id
        ownerId = mockOwner.id

        engineToken = await generateMockToken({
            type: PrincipalType.ENGINE,
            id: generateId(),
            projectId,
            tenant: { id: tenantId },
        })
    })

    describe('workflows.service — createWorkflowsContext().list()', () => {
        it('should return SeekPage<PopulatedWorkflow> with correct shape', async () => {
            const workflowId = generateId()
            const workflowVersionId = generateId()
            const mockWorkflow = createMockWorkflow({
                id: workflowId,
                projectId,
                status: WorkflowStatus.ENABLED,
                externalId: 'ext-workflow-1',
            })
            const mockVersion = createMockWorkflowVersion({
                id: workflowVersionId,
                workflowId,
                state: WorkflowVersionState.LOCKED,
            })
            await db.save('workflow', mockWorkflow)
            await db.save('workflow_version', mockVersion)

            const workflowsContext = createWorkflowsContext({
                engineToken,
                internalApiUrl: apiUrl,
                workflowId,
                workflowVersionId,
            })

            const result = await workflowsContext.list({})

            expect(result).toHaveProperty('data')
            expect(result).toHaveProperty('next')
            expect(result).toHaveProperty('previous')
            expect(Array.isArray(result.data)).toBe(true)
            expect(result.data.length).toBeGreaterThanOrEqual(1)

            const populatedWorkflow = result.data.find(f => f.id === workflowId)
            expect(populatedWorkflow).toBeDefined()
            expect(populatedWorkflow!.id).toBe(workflowId)
            expect(populatedWorkflow!.projectId).toBe(projectId)
            expect(populatedWorkflow!.externalId).toBe('ext-workflow-1')
            expect(populatedWorkflow!.status).toBe(WorkflowStatus.ENABLED)
            expect(populatedWorkflow!.version).toBeDefined()
            expect(populatedWorkflow!.version.id).toBe(workflowVersionId)
            expect(populatedWorkflow!.version.workflowId).toBe(workflowId)
            expect(populatedWorkflow!.version.trigger).toBeDefined()
            expect(populatedWorkflow!.version.trigger.type).toBeDefined()
            expect(populatedWorkflow!.version.trigger.name).toBeDefined()
            expect(populatedWorkflow!.version.trigger.settings).toBeDefined()
            expect(populatedWorkflow!.version.trigger.displayName).toBeDefined()
            expect(populatedWorkflow!.version.displayName).toBeDefined()
            expect(populatedWorkflow!.version.state).toBe(WorkflowVersionState.LOCKED)
        })

        it('should filter by externalIds', async () => {
            const workflow1Id = generateId()
            const workflow2Id = generateId()
            const ext1 = generateId()
            const ext2 = generateId()

            const workflow1 = createMockWorkflow({ id: workflow1Id, projectId, externalId: ext1 })
            const workflow2 = createMockWorkflow({ id: workflow2Id, projectId, externalId: ext2 })
            const version1 = createMockWorkflowVersion({ workflowId: workflow1Id })
            const version2 = createMockWorkflowVersion({ workflowId: workflow2Id })

            await db.save('workflow', workflow1)
            await db.save('workflow', workflow2)
            await db.save('workflow_version', version1)
            await db.save('workflow_version', version2)

            const workflowsContext = createWorkflowsContext({
                engineToken,
                internalApiUrl: apiUrl,
                workflowId: workflow1Id,
                workflowVersionId: version1.id,
            })

            const result = await workflowsContext.list({ externalIds: [ext1] })

            expect(result.data.length).toBe(1)
            expect(result.data[0].externalId).toBe(ext1)
        })

        it('should throw FetchError with invalid token', async () => {
            const workflowsContext = createWorkflowsContext({
                engineToken: 'invalid-token',
                internalApiUrl: apiUrl,
                workflowId: generateId(),
                workflowVersionId: generateId(),
            })

            await expect(workflowsContext.list({})).rejects.toThrow(FetchError)
        })
    })

    describe('connections.service — createConnectionResolver().obtain()', () => {
        it('should obtain connection value with V1 context', async () => {
            const externalId = generateId()
            const secretText = 'my-super-secret'
            const connectionValue = {
                type: ConnectionType.SECRET_TEXT,
                secret_text: secretText,
            }
            const encryptedValue = await encryptUtils.encryptObject(connectionValue)

            const mockConn = createMockConnection({
                tenantId,
                projectIds: [projectId],
                externalId,
                status: ConnectionStatus.ACTIVE,
            }, ownerId)

            await db.save('connection', {
                ...mockConn,
                value: encryptedValue,
            })

            const connectionService = createConnectionResolver({
                projectId,
                engineToken,
                apiUrl,
                contextVersion: ContextVersion.V1,
            })

            const result = await connectionService.obtain(externalId)

            expect(result).toEqual({
                type: ConnectionType.SECRET_TEXT,
                secret_text: secretText,
            })
        })

        it('should return raw secret_text for V0 context (undefined)', async () => {
            const externalId = generateId()
            const secretText = 'v0-secret-value'
            const connectionValue = {
                type: ConnectionType.SECRET_TEXT,
                secret_text: secretText,
            }
            const encryptedValue = await encryptUtils.encryptObject(connectionValue)

            const mockConn = createMockConnection({
                tenantId,
                projectIds: [projectId],
                externalId,
                status: ConnectionStatus.ACTIVE,
            }, ownerId)

            await db.save('connection', {
                ...mockConn,
                value: encryptedValue,
            })

            const connectionService = createConnectionResolver({
                projectId,
                engineToken,
                apiUrl,
                contextVersion: undefined,
            })

            const result = await connectionService.obtain(externalId)

            expect(result).toBe(secretText)
        })

        it('should throw ConnectionNotFoundError for missing connection', async () => {
            const connectionService = createConnectionResolver({
                projectId,
                engineToken,
                apiUrl,
                contextVersion: ContextVersion.V1,
            })

            await expect(connectionService.obtain('non-existent-id')).rejects.toThrow(ConnectionNotFoundError)
        })

        it('should throw ConnectionExpiredError when connection status is ERROR', async () => {
            const externalId = generateId()
            const connectionValue = {
                type: ConnectionType.SECRET_TEXT,
                secret_text: 'expired-secret',
            }
            const encryptedValue = await encryptUtils.encryptObject(connectionValue)

            const mockConn = createMockConnection({
                tenantId,
                projectIds: [projectId],
                externalId,
            }, ownerId)

            await db.save('connection', {
                ...mockConn,
                status: ConnectionStatus.ERROR,
                value: encryptedValue,
            })

            const connectionService = createConnectionResolver({
                projectId,
                engineToken,
                apiUrl,
                contextVersion: ContextVersion.V1,
            })

            await expect(connectionService.obtain(externalId)).rejects.toThrow(ConnectionExpiredError)
        })

        describe('FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING', () => {
            const connectorName = '@fema-ipaas/connector-slack'

            afterEach(() => {
                delete process.env.FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING
            })

            const saveConnection = async (connectionConnectorName: string): Promise<string> => {
                const externalId = generateId()
                const mockConn = createMockConnection({
                    tenantId,
                    projectIds: [projectId],
                    externalId,
                    connectorName: connectionConnectorName,
                }, ownerId)
                await db.save('connection', {
                    ...mockConn,
                    value: await encryptUtils.encryptObject({
                        type: ConnectionType.SECRET_TEXT,
                        secret_text: 'bound-secret',
                    }),
                })
                return externalId
            }

            it('should reject a connection belonging to another connector when enabled', async () => {
                process.env.FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING = 'true'
                const externalId = await saveConnection('@fema-ipaas/connector-google-sheets')

                const connectionService = createConnectionResolver({
                    projectId,
                    engineToken,
                    apiUrl,
                    contextVersion: ContextVersion.V1,
                    connectorName,
                })

                await expect(connectionService.obtain(externalId)).rejects.toThrow(ConnectionConnectorMismatchError)
            })

            it('should allow a connection belonging to the same connector when enabled', async () => {
                process.env.FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING = 'true'
                const externalId = await saveConnection(connectorName)

                const connectionService = createConnectionResolver({
                    projectId,
                    engineToken,
                    apiUrl,
                    contextVersion: ContextVersion.V1,
                    connectorName,
                })

                await expect(connectionService.obtain(externalId)).resolves.toEqual({
                    type: ConnectionType.SECRET_TEXT,
                    secret_text: 'bound-secret',
                })
            })

            it('should allow a connection belonging to another connector when disabled', async () => {
                const externalId = await saveConnection('@fema-ipaas/connector-google-sheets')

                const connectionService = createConnectionResolver({
                    projectId,
                    engineToken,
                    apiUrl,
                    contextVersion: ContextVersion.V1,
                    connectorName,
                })

                await expect(connectionService.obtain(externalId)).resolves.toEqual({
                    type: ConnectionType.SECRET_TEXT,
                    secret_text: 'bound-secret',
                })
            })
        })
    })

    describe('storage.service — createContextStore().put/get/delete()', () => {
        it('should put and get a value', async () => {
            const store = createContextStore({
                apiUrl,
                prefix: '',
                workflowId: generateId(),
                engineToken,
            })

            const putResult = await store.put('myKey', { hello: 'world' })
            expect(putResult).toEqual({ hello: 'world' })

            const getResult = await store.get('myKey')
            expect(getResult).toEqual({ hello: 'world' })
        })

        it('should return null for non-existent key', async () => {
            const store = createContextStore({
                apiUrl,
                prefix: '',
                workflowId: generateId(),
                engineToken,
            })

            const result = await store.get('non-existent-key')
            expect(result).toBeNull()
        })

        it('should delete a value', async () => {
            const store = createContextStore({
                apiUrl,
                prefix: '',
                workflowId: generateId(),
                engineToken,
            })

            await store.put('deleteMe', { data: 'value' })
            await store.delete('deleteMe')
            const result = await store.get('deleteMe')
            expect(result).toBeNull()
        })

        it('should isolate workflow-scoped vs project-scoped keys', async () => {
            const workflowId = generateId()
            const store = createContextStore({
                apiUrl,
                prefix: 'test_',
                workflowId,
                engineToken,
            })

            await store.put('sharedKey', { scope: 'workflow' }, StoreScope.WORKFLOW)
            await store.put('sharedKey', { scope: 'project' }, StoreScope.PROJECT)

            const workflowValue = await store.get('sharedKey', StoreScope.WORKFLOW)
            expect(workflowValue).toEqual({ scope: 'workflow' })

            const projectValue = await store.get('sharedKey', StoreScope.PROJECT)
            expect(projectValue).toEqual({ scope: 'project' })
        })
    })

    describe('step-files.service — createFileUploader().write()', () => {
        it('should upload a file and return a URL', async () => {
            const originalMaxFileSize = process.env.FEMA_MAX_FILE_SIZE_MB
            process.env.FEMA_MAX_FILE_SIZE_MB = '10'

            try {
                const uploader = createFileUploader({
                    apiUrl,
                    engineToken,
                })

                const result = await uploader.write({
                    fileName: 'test.txt',
                    data: Buffer.from('hello world'),
                })

                expect(typeof result).toBe('string')
                expect(result).toContain('/v1/files/')
            }
            finally {
                if (originalMaxFileSize === undefined) {
                    delete process.env.FEMA_MAX_FILE_SIZE_MB
                }
                else {
                    process.env.FEMA_MAX_FILE_SIZE_MB = originalMaxFileSize
                }
            }
        })

        it('should throw FileSizeError when data exceeds max size', async () => {
            const originalMaxFileSize = process.env.FEMA_MAX_FILE_SIZE_MB
            process.env.FEMA_MAX_FILE_SIZE_MB = '0.000001'

            try {
                const uploader = createFileUploader({
                    apiUrl,
                    engineToken,
                })

                await expect(
                    uploader.write({
                        fileName: 'large.txt',
                        data: Buffer.from('this data is too large for the limit'),
                    }),
                ).rejects.toThrow()
            }
            finally {
                if (originalMaxFileSize === undefined) {
                    delete process.env.FEMA_MAX_FILE_SIZE_MB
                }
                else {
                    process.env.FEMA_MAX_FILE_SIZE_MB = originalMaxFileSize
                }
            }
        })
    })
})
