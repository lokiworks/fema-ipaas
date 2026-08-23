import { wideEvent } from '@fema/server-utils'
import {
    ConnectionType,
    ApplicationEventName,
    PackageType,
    ConnectorType,
} from '@fema/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import * as applicationEventsModule from '../../../../src/app/helper/application-events'
import { connectorMetadataService } from '../../../../src/app/connectors/metadata/connector-metadata-service'
import { actionsEmitted } from '../../../helpers/application-events'
import { db } from '../../../helpers/db'
import { createMockConnectorMetadata } from '../../../helpers/mocks'
import { createTestContext, TestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance
let mockLog: FastifyBaseLogger
const originalApplicationEvents = applicationEventsModule.applicationEvents

beforeAll(async () => {
    app = await setupTestEnvironment({ fresh: true })
    mockLog = app.log
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('App connection application events', () => {
    let sendUserEventSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
        sendUserEventSpy = vi.fn()
        vi.spyOn(applicationEventsModule, 'applicationEvents').mockImplementation((log) => {
            const real = originalApplicationEvents(log)
            return {
                ...real,
                sendUserEvent: sendUserEventSpy,
            }
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('emits CONNECTION_UPSERTED on POST /v1/connections', async () => {
        const ctx = await createTestContext(app)
        const connector = await seedConnectorMetadata(ctx)

        const response = await ctx.post('/v1/connections', {
            externalId: 'event-test-connection',
            displayName: 'Event Test Connection',
            connectorName: connector.name,
            workspaceId: ctx.workspace.id,
            type: ConnectionType.SECRET_TEXT,
            value: {
                type: ConnectionType.SECRET_TEXT,
                secret_text: 'my-secret',
            },
            connectorVersion: connector.version,
        })

        expect(response?.statusCode).toBe(StatusCodes.CREATED)
        expect(actionsEmitted(sendUserEventSpy)).toEqual([
            ApplicationEventName.CONNECTION_UPSERTED,
        ])
    })

    it('emits CONNECTION_DELETED on DELETE /v1/connections/:id', async () => {
        const ctx = await createTestContext(app)
        const connector = await seedConnectorMetadata(ctx)

        const createResponse = await ctx.post('/v1/connections', {
            externalId: 'event-test-connection-to-delete',
            displayName: 'Event Test Connection',
            connectorName: connector.name,
            workspaceId: ctx.workspace.id,
            type: ConnectionType.SECRET_TEXT,
            value: {
                type: ConnectionType.SECRET_TEXT,
                secret_text: 'my-secret',
            },
            connectorVersion: connector.version,
        })
        expect(createResponse?.statusCode).toBe(StatusCodes.CREATED)
        const connectionId = createResponse?.json().id

        sendUserEventSpy.mockClear()

        const response = await ctx.delete(`/v1/connections/${connectionId}`)

        expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        expect(actionsEmitted(sendUserEventSpy)).toEqual([
            ApplicationEventName.CONNECTION_DELETED,
        ])
    })

    it('records a connection.listed audit on GET /v1/connections', async () => {
        const ctx = await createTestContext(app)
        const auditSpy = vi.spyOn(wideEvent, 'audit')

        const response = await ctx.get('/v1/connections', {
            workspaceId: ctx.workspace.id,
        })

        expect(response?.statusCode).toBe(StatusCodes.OK)
        expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
            action: 'connection.listed',
            actor: expect.objectContaining({ type: 'user' }),
            target: expect.objectContaining({ type: 'workspace', id: ctx.workspace.id }),
        }))
    })
})

async function seedConnectorMetadata(ctx: TestContext): Promise<{ name: string, version: string }> {
    const connector = createMockConnectorMetadata({
        tenantId: ctx.tenant.id,
        packageType: PackageType.REGISTRY,
        connectorType: ConnectorType.OFFICIAL,
    })
    await db.save('connector_metadata', connector)
    connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(connector)
    return { name: connector.name, version: connector.version }
}

