import { apId } from '@fema/core-utils'
import { ConnectionScope, ConnectionStatus, ConnectionType, PackageType, ConnectorType, PLACEHOLDER_CONNECTION_TYPE } from '@fema/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { connectorMetadataService } from '../../../../src/app/connectors/metadata/connector-metadata-service'
import { db } from '../../../helpers/db'
import { describeWithAuth } from '../../../helpers/describe-with-auth'
import {
    createMockConnection,
    createMockConnectorMetadata,
} from '../../../helpers/mocks'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null
let mockLog: FastifyBaseLogger

beforeAll(async () => {
    app = await setupTestEnvironment()
    mockLog = app!.log!
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Connection CE API', () => {
    describeWithAuth('POST /v1/connections (Create)', () => app!, (setup) => {
        it('should create a SECRET_TEXT connection', async () => {
            const ctx = await setup()

            const mockConnector = createMockConnectorMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            await db.save('connector_metadata', mockConnector)
            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnector)

            const response = await ctx.post('/v1/connections', {
                externalId: 'test-secret-connection',
                displayName: 'Test Secret Connection',
                connectorName: mockConnector.name,
                projectId: ctx.project.id,
                type: ConnectionType.SECRET_TEXT,
                value: {
                    type: ConnectionType.SECRET_TEXT,
                    secret_text: 'my-secret',
                },
                connectorVersion: mockConnector.version,
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            const body = response?.json()
            expect(body.displayName).toBe('Test Secret Connection')
            expect(body.connectorName).toBe(mockConnector.name)
            expect(body.externalId).toBe('test-secret-connection')
            expect(body.value).toBeUndefined()
        })

        it('should create a NO_AUTH connection', async () => {
            const ctx = await setup()

            const mockConnector = createMockConnectorMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            await db.save('connector_metadata', mockConnector)
            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnector)

            const response = await ctx.post('/v1/connections', {
                externalId: 'test-no-auth-connection',
                displayName: 'Test No Auth',
                connectorName: mockConnector.name,
                projectId: ctx.project.id,
                type: ConnectionType.NO_AUTH,
                value: {
                    type: ConnectionType.NO_AUTH,
                },
                connectorVersion: mockConnector.version,
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            const body = response?.json()
            expect(body.displayName).toBe('Test No Auth')
        })

        it('should create a placeholder connection with status MISSING', async () => {
            const ctx = await setup()

            const mockConnector = createMockConnectorMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            await db.save('connector_metadata', mockConnector)
            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnector)

            const response = await ctx.post('/v1/connections', {
                externalId: 'test-placeholder-connection',
                displayName: 'Placeholder Slack',
                connectorName: mockConnector.name,
                projectId: ctx.project.id,
                type: PLACEHOLDER_CONNECTION_TYPE,
                connectorVersion: mockConnector.version,
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            const body = response?.json()
            expect(body.displayName).toBe('Placeholder Slack')
            expect(body.type).toBe(ConnectionType.NO_AUTH)
            expect(body.status).toBe(ConnectionStatus.MISSING)
            expect(body.connectorName).toBe(mockConnector.name)
            expect(body.externalId).toBe('test-placeholder-connection')
        })

        it('should not overwrite an active connection with a placeholder', async () => {
            const ctx = await setup()

            const mockConnector = createMockConnectorMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            await db.save('connector_metadata', mockConnector)
            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnector)

            const active = await ctx.post('/v1/connections', {
                externalId: 'placeholder-no-clobber',
                displayName: 'Active Secret',
                connectorName: mockConnector.name,
                projectId: ctx.project.id,
                type: ConnectionType.SECRET_TEXT,
                value: {
                    type: ConnectionType.SECRET_TEXT,
                    secret_text: 'real-secret',
                },
                connectorVersion: mockConnector.version,
            })
            expect(active?.statusCode).toBe(StatusCodes.CREATED)
            const activeBody = active?.json()
            expect(activeBody.status).toBe(ConnectionStatus.ACTIVE)
            expect(activeBody.type).toBe(ConnectionType.SECRET_TEXT)

            const placeholder = await ctx.post('/v1/connections', {
                externalId: 'placeholder-no-clobber',
                displayName: 'Should Not Win',
                connectorName: mockConnector.name,
                projectId: ctx.project.id,
                type: PLACEHOLDER_CONNECTION_TYPE,
                connectorVersion: mockConnector.version,
            })
            expect(placeholder?.statusCode).toBe(StatusCodes.CREATED)
            const placeholderBody = placeholder?.json()
            expect(placeholderBody.id).toBe(activeBody.id)
            expect(placeholderBody.status).toBe(ConnectionStatus.ACTIVE)
            expect(placeholderBody.type).toBe(ConnectionType.SECRET_TEXT)
            expect(placeholderBody.displayName).toBe('Active Secret')
        })

        it('should transition a placeholder to ACTIVE on real upsert', async () => {
            const ctx = await setup()

            const mockConnector = createMockConnectorMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            await db.save('connector_metadata', mockConnector)
            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnector)

            const placeholder = await ctx.post('/v1/connections', {
                externalId: 'placeholder-fill-in',
                displayName: 'Pending',
                connectorName: mockConnector.name,
                projectId: ctx.project.id,
                type: PLACEHOLDER_CONNECTION_TYPE,
                connectorVersion: mockConnector.version,
            })
            expect(placeholder?.statusCode).toBe(StatusCodes.CREATED)
            const placeholderId = placeholder?.json().id

            const filled = await ctx.post('/v1/connections', {
                externalId: 'placeholder-fill-in',
                displayName: 'Filled In',
                connectorName: mockConnector.name,
                projectId: ctx.project.id,
                type: ConnectionType.SECRET_TEXT,
                value: {
                    type: ConnectionType.SECRET_TEXT,
                    secret_text: 'real-secret',
                },
                connectorVersion: mockConnector.version,
            })
            expect(filled?.statusCode).toBe(StatusCodes.CREATED)
            const filledBody = filled?.json()
            expect(filledBody.id).toBe(placeholderId)
            expect(filledBody.type).toBe(ConnectionType.SECRET_TEXT)
            expect(filledBody.status).toBe(ConnectionStatus.ACTIVE)
            expect(filledBody.displayName).toBe('Filled In')
        })

        it('should upsert on duplicate externalId', async () => {
            const ctx = await setup()

            const mockConnector = createMockConnectorMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            await db.save('connector_metadata', mockConnector)
            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnector)

            const createPayload = {
                externalId: 'upsert-test-connection',
                displayName: 'First Name',
                connectorName: mockConnector.name,
                projectId: ctx.project.id,
                type: ConnectionType.SECRET_TEXT,
                value: {
                    type: ConnectionType.SECRET_TEXT,
                    secret_text: 'secret1',
                },
                connectorVersion: mockConnector.version,
            }

            const first = await ctx.post('/v1/connections', createPayload)
            expect(first?.statusCode).toBe(StatusCodes.CREATED)
            const firstId = first?.json().id

            const second = await ctx.post('/v1/connections', {
                ...createPayload,
                displayName: 'Second Name',
                value: {
                    type: ConnectionType.SECRET_TEXT,
                    secret_text: 'secret2',
                },
            })
            expect(second?.statusCode).toBe(StatusCodes.CREATED)
            const secondBody = second?.json()
            expect(secondBody.id).toBe(firstId)
            expect(secondBody.displayName).toBe('Second Name')
        })
    })

    describeWithAuth('POST /v1/connections/:id (Update)', () => app!, (setup) => {
        it('should update display name', async () => {
            const ctx = await setup()

            const mockConnector = createMockConnectorMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            await db.save('connector_metadata', mockConnector)
            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnector)

            const createResponse = await ctx.post('/v1/connections', {
                externalId: 'update-test-connection',
                displayName: 'Original Name',
                connectorName: mockConnector.name,
                projectId: ctx.project.id,
                type: ConnectionType.SECRET_TEXT,
                value: {
                    type: ConnectionType.SECRET_TEXT,
                    secret_text: 'my-secret',
                },
                connectorVersion: mockConnector.version,
            })
            const connectionId = createResponse?.json().id

            const updateResponse = await ctx.post(`/v1/connections/${connectionId}`, {
                displayName: 'Updated Name',
            })

            expect(updateResponse?.statusCode).toBe(StatusCodes.OK)
            expect(updateResponse?.json().displayName).toBe('Updated Name')
        })

        it('should return 404 for non-existent connection', async () => {
            const ctx = await setup()
            const nonExistentId = apId()

            const response = await ctx.post(`/v1/connections/${nonExistentId}`, {
                displayName: 'Updated Name',
            })

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describeWithAuth('GET /v1/connections (List)', () => app!, (setup) => {
        it('should list connections', async () => {
            const ctx = await setup()

            const mockConnector = createMockConnectorMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            await db.save('connector_metadata', mockConnector)
            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnector)

            await ctx.post('/v1/connections', {
                externalId: 'list-test-connection',
                displayName: 'Test Connection',
                connectorName: mockConnector.name,
                projectId: ctx.project.id,
                type: ConnectionType.SECRET_TEXT,
                value: {
                    type: ConnectionType.SECRET_TEXT,
                    secret_text: 'my-secret',
                },
                connectorVersion: mockConnector.version,
            })

            const response = await ctx.get('/v1/connections', {
                projectId: ctx.project.id,
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.data.length).toBeGreaterThanOrEqual(1)
        })

        it('should filter by connectorName', async () => {
            const ctx = await setup()

            const mockConnectorA = createMockConnectorMetadata({
                name: 'connector-a-filter',
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            const mockConnectorB = createMockConnectorMetadata({
                name: 'connector-b-filter',
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            await db.save('connector_metadata', [mockConnectorA, mockConnectorB])
            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnectorA)

            await ctx.post('/v1/connections', {
                externalId: 'filter-a',
                displayName: 'Connection A',
                connectorName: mockConnectorA.name,
                projectId: ctx.project.id,
                type: ConnectionType.SECRET_TEXT,
                value: { type: ConnectionType.SECRET_TEXT, secret_text: 's' },
                connectorVersion: mockConnectorA.version,
            })

            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnectorB)

            await ctx.post('/v1/connections', {
                externalId: 'filter-b',
                displayName: 'Connection B',
                connectorName: mockConnectorB.name,
                projectId: ctx.project.id,
                type: ConnectionType.SECRET_TEXT,
                value: { type: ConnectionType.SECRET_TEXT, secret_text: 's' },
                connectorVersion: mockConnectorB.version,
            })

            const response = await ctx.get('/v1/connections', {
                projectId: ctx.project.id,
                connectorName: mockConnectorA.name,
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.data).toHaveLength(1)
            expect(body.data[0].connectorName).toBe(mockConnectorA.name)
        })
    })

    describeWithAuth('GET /v1/connections/:id', () => app!, (setup) => {
        it('should get a connection by id without sensitive data', async () => {
            const ctx = await setup()

            const mockConnector = createMockConnectorMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            await db.save('connector_metadata', mockConnector)
            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnector)

            const createResponse = await ctx.post('/v1/connections', {
                externalId: 'get-by-id-test',
                displayName: 'Get Me',
                connectorName: mockConnector.name,
                projectId: ctx.project.id,
                type: ConnectionType.SECRET_TEXT,
                value: { type: ConnectionType.SECRET_TEXT, secret_text: 'my-secret' },
                connectorVersion: mockConnector.version,
            })
            const connectionId = createResponse?.json().id

            const response = await ctx.get(`/v1/connections/${connectionId}`)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.id).toBe(connectionId)
            expect(body.externalId).toBe('get-by-id-test')
            expect(body.value).toBeUndefined()
            expect(body.flowIds).toEqual([])
        })

        it('should return 404 for a non-existent connection', async () => {
            const ctx = await setup()

            const response = await ctx.get(`/v1/connections/${apId()}`)

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('GET /v1/connections (Isolation)', () => {
        it('should isolate connections between projects', async () => {
            const ctx1 = await createTestContext(app!)
            const ctx2 = await createTestContext(app!)

            const mockConnector = createMockConnectorMetadata({
                platformId: ctx1.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            await db.save('connector_metadata', mockConnector)
            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnector)

            await ctx1.post('/v1/connections', {
                externalId: 'isolation-test',
                displayName: 'Project 1 Connection',
                connectorName: mockConnector.name,
                projectId: ctx1.project.id,
                type: ConnectionType.SECRET_TEXT,
                value: { type: ConnectionType.SECRET_TEXT, secret_text: 's' },
                connectorVersion: mockConnector.version,
            })

            const response = await ctx2.get('/v1/connections', {
                projectId: ctx2.project.id,
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            const ids = body.data.map((c: Record<string, string>) => c.externalId)
            expect(ids).not.toContain('isolation-test')
        })

        it('should not get a connection from another project', async () => {
            const ctx1 = await createTestContext(app!)
            const ctx2 = await createTestContext(app!)

            const mockConnector = createMockConnectorMetadata({
                platformId: ctx1.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            await db.save('connector_metadata', mockConnector)
            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnector)

            const createResponse = await ctx1.post('/v1/connections', {
                externalId: 'cross-project-get',
                displayName: 'Project 1 Connection',
                connectorName: mockConnector.name,
                projectId: ctx1.project.id,
                type: ConnectionType.SECRET_TEXT,
                value: { type: ConnectionType.SECRET_TEXT, secret_text: 's' },
                connectorVersion: mockConnector.version,
            })
            const connectionId = createResponse?.json().id

            const response = await ctx2.get(`/v1/connections/${connectionId}`)

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        })
    })

    describeWithAuth('DELETE /v1/connections/:id', () => app!, (setup) => {
        it('should delete a connection', async () => {
            const ctx = await setup()

            const mockConnector = createMockConnectorMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                connectorType: ConnectorType.OFFICIAL,
            })
            await db.save('connector_metadata', mockConnector)
            connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockConnector)

            const createResponse = await ctx.post('/v1/connections', {
                externalId: 'delete-test',
                displayName: 'Delete Me',
                connectorName: mockConnector.name,
                projectId: ctx.project.id,
                type: ConnectionType.SECRET_TEXT,
                value: { type: ConnectionType.SECRET_TEXT, secret_text: 's' },
                connectorVersion: mockConnector.version,
            })
            const connectionId = createResponse?.json().id

            const response = await ctx.delete(`/v1/connections/${connectionId}`)

            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        })

        it('should return 404 for non-existent connection', async () => {
            const ctx = await setup()
            const nonExistentId = apId()

            const response = await ctx.delete(`/v1/connections/${nonExistentId}`)

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })

        it('should not delete a platform-scoped connection from the project route', async () => {
            const ctx = await setup()

            const platformConnection = {
                ...createMockConnection({
                    platformId: ctx.platform.id,
                    projectIds: [ctx.project.id],
                    externalId: 'platform-delete-test',
                }, ctx.user.id),
                scope: ConnectionScope.PLATFORM,
            }
            await db.save('connection', platformConnection)

            const response = await ctx.delete(`/v1/connections/${platformConnection.id}`)

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)

            const stillExists = await db.findOneBy('connection', { id: platformConnection.id })
            expect(stillExists).not.toBeNull()
        })
    })
})
