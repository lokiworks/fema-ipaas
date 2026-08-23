import { wideEvent } from '@fema/server-utils'
import {
    AppConnectionType,
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

    it('emits CONNECTION_UPSERTED on POST /v1/app-connections', async () => {
        const ctx = await createTestContext(app)
        const connector = await seedConnectorMetadata(ctx)

        const response = await ctx.post('/v1/app-connections', {
            externalId: 'event-test-connection',
            displayName: 'Event Test Connection',
            connectorName: connector.name,
            projectId: ctx.project.id,
            type: AppConnectionType.SECRET_TEXT,
            value: {
                type: AppConnectionType.SECRET_TEXT,
                secret_text: 'my-secret',
            },
            connectorVersion: connector.version,
        })

        expect(response?.statusCode).toBe(StatusCodes.CREATED)
        expect(actionsEmitted(sendUserEventSpy)).toEqual([
            ApplicationEventName.CONNECTION_UPSERTED,
        ])
    })

    it('emits CONNECTION_DELETED on DELETE /v1/app-connections/:id', async () => {
        const ctx = await createTestContext(app)
        const connector = await seedConnectorMetadata(ctx)

        const createResponse = await ctx.post('/v1/app-connections', {
            externalId: 'event-test-connection-to-delete',
            displayName: 'Event Test Connection',
            connectorName: connector.name,
            projectId: ctx.project.id,
            type: AppConnectionType.SECRET_TEXT,
            value: {
                type: AppConnectionType.SECRET_TEXT,
                secret_text: 'my-secret',
            },
            connectorVersion: connector.version,
        })
        expect(createResponse?.statusCode).toBe(StatusCodes.CREATED)
        const connectionId = createResponse?.json().id

        sendUserEventSpy.mockClear()

        const response = await ctx.delete(`/v1/app-connections/${connectionId}`)

        expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        expect(actionsEmitted(sendUserEventSpy)).toEqual([
            ApplicationEventName.CONNECTION_DELETED,
        ])
    })

    it('records a connection.listed audit on GET /v1/app-connections', async () => {
        const ctx = await createTestContext(app)
        const auditSpy = vi.spyOn(wideEvent, 'audit')

        const response = await ctx.get('/v1/app-connections', {
            projectId: ctx.project.id,
        })

        expect(response?.statusCode).toBe(StatusCodes.OK)
        expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
            action: 'connection.listed',
            actor: expect.objectContaining({ type: 'user' }),
            target: expect.objectContaining({ type: 'project', id: ctx.project.id }),
        }))
    })
})

async function seedConnectorMetadata(ctx: TestContext): Promise<{ name: string, version: string }> {
    const connector = createMockConnectorMetadata({
        platformId: ctx.platform.id,
        packageType: PackageType.REGISTRY,
        connectorType: ConnectorType.OFFICIAL,
    })
    await db.save('connector_metadata', connector)
    connectorMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(connector)
    return { name: connector.name, version: connector.version }
}

