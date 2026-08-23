import { apId } from '@fema/core-utils'
import { ActionBase } from '@fema/connector-sdk'
import { DefaultProjectRole, FlowTriggerType, PackageType, ConnectorType, PrincipalType } from '@fema/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { connectorCache } from '../../../../src/app/connectors/metadata/connector-cache'
import { connectorMetadataService } from '../../../../src/app/connectors/metadata/connector-metadata-service'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import {
    createMockFlow,
    createMockFlowVersion,
    createMockConnectorMetadata,
} from '../../../helpers/mocks'
import { createMemberContext, createTestContext } from '../../../helpers/test-context'
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

beforeEach(async () => {
    await databaseConnection().getRepository('connector_metadata').createQueryBuilder().delete().execute()
})

describe('Connector Metadata CE API', () => {
    describe('GET /v1/connectors/categories', () => {
        it('should return connector categories', async () => {
            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connectors/categories',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(Array.isArray(body)).toBe(true)
        })
    })

    describe('GET /v1/connectors (List)', () => {
        it('should list connectors', async () => {
            const mockConnector = createMockConnectorMetadata({
                name: 'ce-list-test-connector',
                connectorType: ConnectorType.OFFICIAL,
                displayName: 'CE List Test',
                packageType: PackageType.REGISTRY,
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connectors',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(Array.isArray(body)).toBe(true)
            expect(body).toHaveLength(1)
            expect(body[0].name).toBe('ce-list-test-connector')
        })

        it('should filter connectors by searchQuery', async () => {
            const mockConnectorA = createMockConnectorMetadata({
                name: 'searchable-unique-connector',
                connectorType: ConnectorType.OFFICIAL,
                displayName: 'Searchable Unique Connector',
                packageType: PackageType.REGISTRY,
            })
            const mockConnectorB = createMockConnectorMetadata({
                name: 'other-connector-xyz',
                connectorType: ConnectorType.OFFICIAL,
                displayName: 'Other Connector XYZ',
                packageType: PackageType.REGISTRY,
            })
            await db.save('connector_metadata', [mockConnectorA, mockConnectorB])
            await connectorCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connectors?searchQuery=Searchable+Unique',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body).toHaveLength(1)
            expect(body[0].name).toBe('searchable-unique-connector')
        })
    })

    describe('GET /v1/connectors/:name', () => {
        it('should get connector by name', async () => {
            const mockConnector = createMockConnectorMetadata({
                name: 'ce-get-test-connector',
                connectorType: ConnectorType.OFFICIAL,
                displayName: 'CE Get Test',
                packageType: PackageType.REGISTRY,
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connectors/ce-get-test-connector',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.name).toBe('ce-get-test-connector')
            expect(body.displayName).toBe('CE Get Test')
        })

        it('should return 404 for non-existent connector', async () => {
            await connectorCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connectors/non-existent-connector-xyz',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('GET /v1/connectors/:scope/:name', () => {
        it('should get connector by scope and name', async () => {
            const ctx = await createTestContext(app!)

            const mockConnector = createMockConnectorMetadata({
                name: '@fema/ce-scoped-connector',
                connectorType: ConnectorType.OFFICIAL,
                displayName: 'CE Scoped Test',
                packageType: PackageType.REGISTRY,
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const response = await ctx.get(`/v1/connectors/@fema/ce-scoped-connector?projectId=${ctx.project.id}`)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.name).toBe('@fema/ce-scoped-connector')
        })
    })

    describe('POST /v1/connectors/sync', () => {
        it('should sync connectors as platform admin', async () => {
            const ctx = await createTestContext(app!)

            const response = await ctx.post('/v1/connectors/sync', {})

            // Sync should succeed (200) or be accepted
            expect([StatusCodes.OK, StatusCodes.NO_CONTENT]).toContain(response?.statusCode)
        })
    })

    describe('release-compatibility fallback', () => {
        it('GET /v1/connectors/:scope/:name falls back to the newest compatible version when latest requires a newer release', async () => {
            const compatible = createMockConnectorMetadata({
                name: '@fema/connector-release-test',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.32',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            const incompatible = createMockConnectorMetadata({
                name: '@fema/connector-release-test',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.33',
                minimumSupportedRelease: '99.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            await db.save('connector_metadata', [compatible, incompatible])
            await connectorCache(mockLog).setup()

            const ctx = await createTestContext(app!)
            const response = await ctx.get('/v1/connectors/@fema/connector-release-test')

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(response?.json().version).toBe('0.1.32')
        })

        it('GET /v1/connectors returns the newest compatible version in list when latest is incompatible', async () => {
            const compatible = createMockConnectorMetadata({
                name: 'list-release-test-connector',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.32',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            const incompatible = createMockConnectorMetadata({
                name: 'list-release-test-connector',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.33',
                minimumSupportedRelease: '99.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            await db.save('connector_metadata', [compatible, incompatible])
            await connectorCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connectors',
                headers: { authorization: `Bearer ${testToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const entry = response?.json().find((p: { name: string }) => p.name === 'list-release-test-connector')
            expect(entry).toBeDefined()
            expect(entry.version).toBe('0.1.32')
        })

        it('GET /v1/connectors/:scope/:name returns 404 when all versions are incompatible', async () => {
            const incompatible = createMockConnectorMetadata({
                name: '@fema/connector-all-incompatible',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.33',
                minimumSupportedRelease: '99.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            await db.save('connector_metadata', incompatible)
            await connectorCache(mockLog).setup()

            const ctx = await createTestContext(app!)
            const response = await ctx.get('/v1/connectors/@fema/connector-all-incompatible')

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('DELETE /v1/connectors/:id', () => {
        it('should delete a custom connector owned by the platform', async () => {
            const ctx = await createTestContext(app!)
            const mockConnector = createMockConnectorMetadata({
                name: '@custom/deletable-connector',
                connectorType: ConnectorType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId: ctx.platform.id,
                version: '0.1.0',
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const response = await ctx.delete(`/v1/connectors/${mockConnector.id}`)

            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
            const remaining = await databaseConnection().getRepository('connector_metadata').findOneBy({ id: mockConnector.id })
            expect(remaining).toBeNull()
        })

        it('should return 404 for a non-existent connector id', async () => {
            const ctx = await createTestContext(app!)
            await connectorCache(mockLog).setup()

            const response = await ctx.delete(`/v1/connectors/${apId()}`)

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })

        it('should delete all versions of the custom connector', async () => {
            const ctx = await createTestContext(app!)
            const versionOne = createMockConnectorMetadata({
                name: '@custom/multi-version-connector',
                connectorType: ConnectorType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId: ctx.platform.id,
                version: '0.1.0',
            })
            const versionTwo = createMockConnectorMetadata({
                name: '@custom/multi-version-connector',
                connectorType: ConnectorType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId: ctx.platform.id,
                version: '0.2.0',
            })
            await db.save('connector_metadata', [versionOne, versionTwo])
            await connectorCache(mockLog).setup()

            const response = await ctx.delete(`/v1/connectors/${versionTwo.id}`)

            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
            const remaining = await databaseConnection().getRepository('connector_metadata').findBy({ name: '@custom/multi-version-connector' })
            expect(remaining).toHaveLength(0)
        })

        it('should reject deleting a platform-owned official connector with 403', async () => {
            const ctx = await createTestContext(app!)
            const mockConnector = createMockConnectorMetadata({
                name: '@fema/official-connector',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                platformId: ctx.platform.id,
                version: '0.1.0',
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const response = await ctx.delete(`/v1/connectors/${mockConnector.id}`)

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
            const remaining = await databaseConnection().getRepository('connector_metadata').findOneBy({ id: mockConnector.id })
            expect(remaining).not.toBeNull()
        })

        it('should reject deletion by a non-admin platform member with 403', async () => {
            const ownerCtx = await createTestContext(app!)
            const memberCtx = await createMemberContext(app!, ownerCtx, {
                projectRole: DefaultProjectRole.EDITOR,
            })
            const mockConnector = createMockConnectorMetadata({
                name: '@custom/member-cannot-delete',
                connectorType: ConnectorType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId: ownerCtx.platform.id,
                version: '0.1.0',
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const response = await memberCtx.delete(`/v1/connectors/${mockConnector.id}`)

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
            const remaining = await databaseConnection().getRepository('connector_metadata').findOneBy({ id: mockConnector.id })
            expect(remaining).not.toBeNull()
        })

        it('should not delete a custom connector owned by another platform', async () => {
            const ctx = await createTestContext(app!)
            const mockConnector = createMockConnectorMetadata({
                name: '@custom/other-platform-connector',
                connectorType: ConnectorType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId: apId(),
                version: '0.1.0',
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const response = await ctx.delete(`/v1/connectors/${mockConnector.id}`)

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
            const remaining = await databaseConnection().getRepository('connector_metadata').findOneBy({ id: mockConnector.id })
            expect(remaining).not.toBeNull()
        })

        it('should reject deleting a custom connector that is still used by a flow', async () => {
            const ctx = await createTestContext(app!)
            const mockConnector = createMockConnectorMetadata({
                name: '@custom/in-use-connector',
                connectorType: ConnectorType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId: ctx.platform.id,
                version: '0.1.0',
            })
            await db.save('connector_metadata', mockConnector)
            const mockFlow = createMockFlow({ projectId: ctx.project.id })
            await db.save('flow', mockFlow)
            const mockFlowVersion = createMockFlowVersion({
                flowId: mockFlow.id,
                updatedBy: ctx.user.id,
                displayName: 'My Webhook Flow',
                trigger: {
                    type: FlowTriggerType.CONNECTOR,
                    name: 'trigger',
                    settings: {
                        connectorName: mockConnector.name,
                        connectorVersion: mockConnector.version,
                        input: {},
                        propertySettings: {},
                        triggerName: 'sample_trigger',
                    },
                    valid: true,
                    displayName: 'Trigger',
                },
            })
            await db.save('flow_version', mockFlowVersion)
            await connectorCache(mockLog).setup()

            const response = await ctx.delete(`/v1/connectors/${mockConnector.id}`)

            expect(response?.statusCode).toBe(StatusCodes.CONFLICT)
            expect(response?.json().params.message).toContain('My Webhook Flow')
            const remaining = await databaseConnection().getRepository('connector_metadata').findOneBy({ id: mockConnector.id })
            expect(remaining).not.toBeNull()
        })

        it('should allow deleting a custom connector that is only referenced by a stale flow version', async () => {
            const ctx = await createTestContext(app!)
            const mockConnector = createMockConnectorMetadata({
                name: '@custom/stale-version-connector',
                connectorType: ConnectorType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId: ctx.platform.id,
                version: '0.1.0',
            })
            await db.save('connector_metadata', mockConnector)
            const mockFlow = createMockFlow({ projectId: ctx.project.id })
            await db.save('flow', mockFlow)
            const staleVersion = createMockFlowVersion({
                flowId: mockFlow.id,
                updatedBy: ctx.user.id,
                created: '2020-01-01T00:00:00.000Z',
                trigger: {
                    type: FlowTriggerType.CONNECTOR,
                    name: 'trigger',
                    settings: {
                        connectorName: mockConnector.name,
                        connectorVersion: mockConnector.version,
                        input: {},
                        propertySettings: {},
                        triggerName: 'sample_trigger',
                    },
                    valid: true,
                    displayName: 'Trigger',
                },
            })
            const latestVersion = createMockFlowVersion({
                flowId: mockFlow.id,
                updatedBy: ctx.user.id,
                created: '2024-01-01T00:00:00.000Z',
            })
            await db.save('flow_version', [staleVersion, latestVersion])
            await connectorCache(mockLog).setup()

            const response = await ctx.delete(`/v1/connectors/${mockConnector.id}`)

            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
            const remaining = await databaseConnection().getRepository('connector_metadata').findOneBy({ id: mockConnector.id })
            expect(remaining).toBeNull()
        })

        it('should allow deleting a custom connector used only by a flow in another platform', async () => {
            const ctx = await createTestContext(app!)
            const otherCtx = await createTestContext(app!)
            const mockConnector = createMockConnectorMetadata({
                name: '@custom/cross-platform-usage-connector',
                connectorType: ConnectorType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId: ctx.platform.id,
                version: '0.1.0',
            })
            await db.save('connector_metadata', mockConnector)
            const otherFlow = createMockFlow({ projectId: otherCtx.project.id })
            await db.save('flow', otherFlow)
            const otherFlowVersion = createMockFlowVersion({
                flowId: otherFlow.id,
                updatedBy: otherCtx.user.id,
                trigger: {
                    type: FlowTriggerType.CONNECTOR,
                    name: 'trigger',
                    settings: {
                        connectorName: mockConnector.name,
                        connectorVersion: mockConnector.version,
                        input: {},
                        propertySettings: {},
                        triggerName: 'sample_trigger',
                    },
                    valid: true,
                    displayName: 'Trigger',
                },
            })
            await db.save('flow_version', otherFlowVersion)
            await connectorCache(mockLog).setup()

            const response = await ctx.delete(`/v1/connectors/${mockConnector.id}`)

            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
            const remaining = await databaseConnection().getRepository('connector_metadata').findOneBy({ id: mockConnector.id })
            expect(remaining).toBeNull()
        })
    })

    describe('connectorMetadataService.get() — custom connectors', () => {
        it('should return undefined for custom connector when platformId is not provided', async () => {
            const platformId = apId()
            const mockConnector = createMockConnectorMetadata({
                name: '@custom/my-connector',
                connectorType: ConnectorType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId,
                version: '0.1.0',
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const result = await connectorMetadataService(mockLog).get({
                name: '@custom/my-connector',
                version: '0.1.0',
            })
            expect(result).toBeUndefined()
        })

        it('should return custom connector when platformId is provided', async () => {
            const platformId = apId()
            const mockConnector = createMockConnectorMetadata({
                name: '@custom/my-connector',
                connectorType: ConnectorType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId,
                version: '0.1.0',
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const result = await connectorMetadataService(mockLog).get({
                name: '@custom/my-connector',
                version: '0.1.0',
                platformId,
            })
            expect(result).toBeDefined()
            expect(result?.name).toBe('@custom/my-connector')
        })
    })

    describe('audience filtering (canvas filter)', () => {
        const buildActions = (): Record<string, ActionBase> => ({
            human_only_action: { name: 'human_only_action', displayName: 'Human Only', description: 'human only action', props: {}, requireAuth: false, audience: 'human' },
            both_action: { name: 'both_action', displayName: 'Both Action', description: 'both audiences action', props: {}, requireAuth: false, audience: 'both' },
            untagged_action: { name: 'untagged_action', displayName: 'Untagged Action', description: 'untagged action', props: {}, requireAuth: false },
            ai_action: { name: 'ai_action', displayName: 'AI Action', description: 'ai only action', props: {}, requireAuth: false, audience: 'ai' },
        })

        it('GET /v1/connectors/:name hides audience:ai by default and keeps both + untagged', async () => {
            const mockConnector = createMockConnectorMetadata({
                name: 'audience-detail-connector',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                actions: buildActions(),
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const testToken = await generateMockToken({ type: PrincipalType.UNKNOWN, id: apId() })
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connectors/audience-detail-connector',
                headers: { authorization: `Bearer ${testToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(Object.keys(body.actions).sort()).toEqual(['both_action', 'human_only_action', 'untagged_action'])
            expect(body.actions).not.toHaveProperty('ai_action')
        })

        it('GET /v1/connectors/:name?audience=all returns every action', async () => {
            const mockConnector = createMockConnectorMetadata({
                name: 'audience-detail-connector',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                actions: buildActions(),
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const testToken = await generateMockToken({ type: PrincipalType.UNKNOWN, id: apId() })
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connectors/audience-detail-connector?audience=all',
                headers: { authorization: `Bearer ${testToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(Object.keys(body.actions).sort()).toEqual(['ai_action', 'both_action', 'human_only_action', 'untagged_action'])
        })

        it('GET /v1/connectors/:name?audience=ai hides human-only and keeps ai + both + untagged', async () => {
            const mockConnector = createMockConnectorMetadata({
                name: 'audience-detail-connector',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                actions: buildActions(),
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const testToken = await generateMockToken({ type: PrincipalType.UNKNOWN, id: apId() })
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connectors/audience-detail-connector?audience=ai',
                headers: { authorization: `Bearer ${testToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(Object.keys(body.actions).sort()).toEqual(['ai_action', 'both_action', 'untagged_action'])
            expect(body.actions).not.toHaveProperty('human_only_action')
        })

        it('GET /v1/connectors/:scope/:name hides audience:ai by default', async () => {
            const ctx = await createTestContext(app!)
            const mockConnector = createMockConnectorMetadata({
                name: '@fema/audience-scoped-connector',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                actions: buildActions(),
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const response = await ctx.get('/v1/connectors/@fema/audience-scoped-connector')

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(Object.keys(body.actions).sort()).toEqual(['both_action', 'human_only_action', 'untagged_action'])
            expect(body.actions).not.toHaveProperty('ai_action')
        })

        it('GET /v1/connectors hides audience:ai from suggestedActions and recomputes the count by default', async () => {
            const mockConnector = createMockConnectorMetadata({
                name: 'audience-list-connector',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                actions: buildActions(),
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const testToken = await generateMockToken({ type: PrincipalType.UNKNOWN, id: apId() })
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connectors?suggestionType=ACTION',
                headers: { authorization: `Bearer ${testToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const entry = response?.json().find((p: { name: string }) => p.name === 'audience-list-connector')
            expect(entry).toBeDefined()
            const suggestedNames = entry.suggestedActions.map((a: { name: string }) => a.name).sort()
            expect(suggestedNames).toEqual(['both_action', 'human_only_action', 'untagged_action'])
            expect(entry.actions).toBe(3)
        })

        it('GET /v1/connectors?audience=all keeps every action and the full count', async () => {
            const mockConnector = createMockConnectorMetadata({
                name: 'audience-list-connector',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                actions: buildActions(),
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const testToken = await generateMockToken({ type: PrincipalType.UNKNOWN, id: apId() })
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connectors?suggestionType=ACTION&audience=all',
                headers: { authorization: `Bearer ${testToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const entry = response?.json().find((p: { name: string }) => p.name === 'audience-list-connector')
            expect(entry).toBeDefined()
            const suggestedNames = entry.suggestedActions.map((a: { name: string }) => a.name).sort()
            expect(suggestedNames).toEqual(['ai_action', 'both_action', 'human_only_action', 'untagged_action'])
            expect(entry.actions).toBe(4)
        })

        it('GET /v1/connectors (no suggestionType) reports an audience-filtered action count by default', async () => {
            const mockConnector = createMockConnectorMetadata({
                name: 'audience-bare-list-connector',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                actions: buildActions(),
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const testToken = await generateMockToken({ type: PrincipalType.UNKNOWN, id: apId() })
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connectors',
                headers: { authorization: `Bearer ${testToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const entry = response?.json().find((p: { name: string }) => p.name === 'audience-bare-list-connector')
            expect(entry).toBeDefined()
            expect(entry.suggestedActions).toBeUndefined()
            expect(entry.actions).toBe(3)
        })

        it('GET /v1/connectors?audience=all (no suggestionType) reports the full action count', async () => {
            const mockConnector = createMockConnectorMetadata({
                name: 'audience-bare-list-connector',
                connectorType: ConnectorType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                actions: buildActions(),
            })
            await db.save('connector_metadata', mockConnector)
            await connectorCache(mockLog).setup()

            const testToken = await generateMockToken({ type: PrincipalType.UNKNOWN, id: apId() })
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connectors?audience=all',
                headers: { authorization: `Bearer ${testToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const entry = response?.json().find((p: { name: string }) => p.name === 'audience-bare-list-connector')
            expect(entry).toBeDefined()
            expect(entry.actions).toBe(4)
        })
    })
})
