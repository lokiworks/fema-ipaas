import { apId, isNil } from '@fema-ipaas/core-utils'
import { PropertyType } from '@fema-ipaas/connector-sdk'
import { Connection, ConnectionScope, ConnectionStatus, ConnectionType, CustomAuthConnectionValue, PackageType, ConnectorType } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { connectionHandler } from '../../../../src/app/connection/connection-service/connection.handler'
import { db } from '../../../helpers/db'
import { createMockConnectorMetadata } from '../../../helpers/mocks'
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

const customAuthOf = (overrides: Record<string, unknown>) => ({
    type: PropertyType.CUSTOM_AUTH,
    displayName: 'Connection',
    required: true,
    props: {},
    ...overrides,
})

const saveCustomAuthConnector = async ({ connectorName, connectorVersion, tenantId, hasRefresh }: { connectorName: string, connectorVersion: string, tenantId: string | undefined, hasRefresh: boolean }): Promise<void> => {
    const mockConnector = createMockConnectorMetadata({
        name: connectorName,
        version: connectorVersion,
        tenantId,
        connectorType: isNil(tenantId) ? ConnectorType.OFFICIAL : ConnectorType.CUSTOM,
        packageType: PackageType.REGISTRY,
        minimumSupportedRelease: '0.0.0',
        maximumSupportedRelease: '999.999.999',
        // Functions (generate) do not survive metadata serialization; the stored
        // refresh is a plain object, so detection only checks for its presence.
        auth: customAuthOf(hasRefresh ? { refresh: { defaultExpiresIn: 3300 } } : {}),
    })
    await db.save('connector_metadata', mockConnector)
}

const customAuthConnection = ({ tenantId, connectorName, connectorVersion, value }: { tenantId: string, connectorName: string, connectorVersion: string, value: CustomAuthConnectionValue }): Connection => ({
    id: apId(),
    created: dayjs().toISOString(),
    updated: dayjs().toISOString(),
    tenantId,
    workspaceIds: [apId()],
    connectorName,
    connectorVersion,
    displayName: 'Test Custom Auth',
    type: ConnectionType.CUSTOM_AUTH,
    scope: ConnectionScope.WORKSPACE,
    status: ConnectionStatus.ACTIVE,
    ownerId: apId(),
    value,
    metadata: {},
    externalId: apId(),
    owner: null,
    preSelectForNewWorkspaces: false,
})

describe('Custom auth token refresh — needRefresh', () => {
    describe('refresh-support detection from stored metadata', () => {
        it('returns true when the connector metadata declares a refresh callback', async () => {
            const connectorName = `connector-${apId()}`
            const tenantId = apId()
            await saveCustomAuthConnector({ connectorName, connectorVersion: '1.0.0', tenantId, hasRefresh: true })

            const connection = customAuthConnection({
                tenantId,
                connectorName,
                connectorVersion: '1.0.0',
                value: { type: ConnectionType.CUSTOM_AUTH, props: {} },
            })

            const result = await connectionHandler(mockLog).needRefresh(connection, mockLog)
            expect(result).toBe(true)
        })

        it('returns false when the connector metadata has no refresh callback', async () => {
            const connectorName = `connector-${apId()}`
            const tenantId = apId()
            await saveCustomAuthConnector({ connectorName, connectorVersion: '1.0.0', tenantId, hasRefresh: false })

            const connection = customAuthConnection({
                tenantId,
                connectorName,
                connectorVersion: '1.0.0',
                value: { type: ConnectionType.CUSTOM_AUTH, props: {} },
            })

            const result = await connectionHandler(mockLog).needRefresh(connection, mockLog)
            expect(result).toBe(false)
        })
    })

    describe('per-tenant cache scoping', () => {
        it('resolves each tenant independently when two tenants share a connector name@version with different refresh support', async () => {
            const connectorName = `connector-${apId()}`
            const connectorVersion = '1.0.0'
            const tenantWithRefresh = apId()
            const tenantWithoutRefresh = apId()

            await saveCustomAuthConnector({ connectorName, connectorVersion, tenantId: tenantWithRefresh, hasRefresh: true })
            await saveCustomAuthConnector({ connectorName, connectorVersion, tenantId: tenantWithoutRefresh, hasRefresh: false })

            const connWithRefresh = customAuthConnection({
                tenantId: tenantWithRefresh,
                connectorName,
                connectorVersion,
                value: { type: ConnectionType.CUSTOM_AUTH, props: {} },
            })
            const connWithoutRefresh = customAuthConnection({
                tenantId: tenantWithoutRefresh,
                connectorName,
                connectorVersion,
                value: { type: ConnectionType.CUSTOM_AUTH, props: {} },
            })

            // Warm the cache for the refresh-supporting tenant first; a key that
            // ignored tenantId would then leak `true` to the other tenant.
            expect(await connectionHandler(mockLog).needRefresh(connWithRefresh, mockLog)).toBe(true)
            expect(await connectionHandler(mockLog).needRefresh(connWithoutRefresh, mockLog)).toBe(false)
        })
    })

    describe('token branch', () => {
        it('uses token staleness without a metadata lookup when a token is already present', async () => {
            // No connector_metadata row is saved — if needRefresh consulted metadata it would throw.
            const connectorName = `connector-${apId()}`

            const staleConnection = customAuthConnection({
                tenantId: apId(),
                connectorName,
                connectorVersion: '1.0.0',
                value: { type: ConnectionType.CUSTOM_AUTH, props: {}, access_token: 'tok', token_refresh_at: dayjs().unix() - 60 },
            })
            expect(await connectionHandler(mockLog).needRefresh(staleConnection, mockLog)).toBe(true)

            const freshConnection = customAuthConnection({
                tenantId: apId(),
                connectorName,
                connectorVersion: '1.0.0',
                value: { type: ConnectionType.CUSTOM_AUTH, props: {}, access_token: 'tok', token_refresh_at: dayjs().unix() + 3600 },
            })
            expect(await connectionHandler(mockLog).needRefresh(freshConnection, mockLog)).toBe(false)
        })
    })
})
