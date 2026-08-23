/**
 * E2E integration test for EXECUTE_PROPERTY (connector options).
 *
 * Tests the full round-trip:
 *   API endpoint → BullMQ queue → worker poll (Socket.IO RPC) → connector install → sandbox execution → response back via BullMQ
 *
 * Prerequisites:
 *   - Engine must be built (cache/v8/common/main.js)
 *   - bun must be available for connector installation
 *   - Redis (in-memory via FEMA_REDIS_TYPE=MEMORY) is started automatically
 */
import { apDayjs } from '@fema/server-utils'
import {
    FlowTriggerType,
    FlowVersionState,
    PackageType,
    ConnectorType,
    PrincipalType,
} from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { worker } from '../../../../../worker/src/lib/worker'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import { setupE2eEnvironment } from '../../../helpers/e2e-setup'
import {
    createMockFlow,
    createMockFlowVersion,
    createMockConnectorMetadata,
    mockAndSaveBasicSetup,
} from '../../../helpers/mocks'

let app: FastifyInstance
let apiUrl: string

beforeAll(async () => {
    const ctx = await setupE2eEnvironment()
    app = ctx.app
    apiUrl = ctx.apiUrl
    await worker.start({
        apiUrl: ctx.apiUrl,
        socketUrl: { url: ctx.apiUrl, path: '/api/socket.io' },
        workerToken: ctx.workerToken,
    })
    // Give the worker time to connect and fetch settings
    await new Promise((resolve) => setTimeout(resolve, 5000))
}, 30_000)

afterAll(async () => {
    worker.stop()
    await app.close()
}, 15_000)

describe('Connector Options E2E', () => {
    it('returns dynamic properties for webhook authFields via full worker round-trip', async () => {
        const { mockPlatform, mockWorkspace, mockOwner } = await mockAndSaveBasicSetup()

        const mockFlow = createMockFlow({
            workspaceId: mockWorkspace.id,
        })
        await db.save('flow', mockFlow)

        const mockFlowVersion = createMockFlowVersion({
            flowId: mockFlow.id,
            state: FlowVersionState.DRAFT,
            trigger: {
                type: FlowTriggerType.CONNECTOR,
                name: 'trigger',
                displayName: 'Catch Webhook',
                settings: {
                    connectorName: '@fema/connector-webhook',
                    connectorVersion: '~0.1.29',
                    triggerName: 'catch_webhook',
                    input: { authType: 'basic' },
                    propertySettings: {},
                },
                valid: true,
                lastUpdatedDate: apDayjs().toISOString(),
            },
        })
        await db.save('flow_version', mockFlowVersion)

        const mockConnector = createMockConnectorMetadata({
            name: '@fema/connector-webhook',
            version: '0.1.29',
            platformId: undefined,
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
        })
        await databaseConnection().getRepository('connector_metadata').save(mockConnector)

        const token = await generateMockToken({
            id: mockOwner.id,
            type: PrincipalType.USER,
            platform: { id: mockPlatform.id },
        })

        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/connectors/options',
            headers: {
                authorization: `Bearer ${token}`,
            },
            body: {
                workspaceId: mockWorkspace.id,
                flowId: mockFlow.id,
                flowVersionId: mockFlowVersion.id,
                connectorName: '@fema/connector-webhook',
                connectorVersion: '~0.1.29',
                actionOrTriggerName: 'catch_webhook',
                propertyName: 'authFields',
                input: { authType: 'basic' },
            },
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        expect(body).toBeDefined()
        expect(body.type).toBe('DYNAMIC')
        expect(body.options.username).toBeDefined()
        expect(body.options.password).toBeDefined()
    }, 120_000)
})
