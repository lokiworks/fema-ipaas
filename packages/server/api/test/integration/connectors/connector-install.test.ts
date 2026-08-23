import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    DefaultWorkspaceRole,
    EngineResponseStatus,
    PackageType,
    ConnectorScope,
    ConnectorType,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { MockInstance } from 'vitest'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { connectorMetadataService } from '../../../../src/app/connectors/metadata/connector-metadata-service'
import { userInteractionWatcher } from '../../../../src/app/workers/user-interaction-watcher'
import { createMemberContext, createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

const CONNECTOR_NAME = 'testing-before-new-ci-discord'
const CONNECTOR_VERSION = '0.4.4'

const tgzBuffer = readFileSync(
    join(__dirname, '../../../../src/assets/private-connector-test.tgz'),
)

const mockConnectorMetadata = {
    name: CONNECTOR_NAME,
    version: CONNECTOR_VERSION,
    displayName: 'Discord Test Connector',
    logoUrl: 'https://cdn.fema.local/connectors/discord.png',
    description: 'Test discord connector',
    auth: undefined,
    actions: {},
    triggers: {},
    minimumSupportedRelease: '0.0.0',
    maximumSupportedRelease: '999.999.999',
    authors: [],
    categories: [],
    i18n: {},
}

let app: FastifyInstance | null = null
let mockLog: FastifyBaseLogger
let interactionSpy: MockInstance

beforeAll(async () => {
    app = await setupTestEnvironment()
    mockLog = app!.log!
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(async () => {
    await databaseConnection().getRepository('connector_metadata').createQueryBuilder().delete().execute()
    interactionSpy = vi.spyOn(userInteractionWatcher, 'submitAndWaitForResponse').mockResolvedValue({
        status: EngineResponseStatus.OK,
        response: mockConnectorMetadata,
        error: undefined,
    })
})

afterEach(() => {
    interactionSpy.mockRestore()
})

describe('POST /v1/connectors — private connector installation', () => {
    it('should install a private connector from a tgz archive and persist metadata', async () => {
        const ctx = await createTestContext(app!)

        const formData = new FormData()
        formData.append(
            'connectorArchive',
            new Blob([tgzBuffer], { type: 'application/gzip' }),
            'private-connector-test.tgz',
        )
        formData.append('connectorName', CONNECTOR_NAME)
        formData.append('connectorVersion', CONNECTOR_VERSION)
        formData.append('packageType', PackageType.ARCHIVE)
        formData.append('scope', ConnectorScope.TENANT)

        const response = await ctx.inject({
            method: 'POST',
            url: '/api/v1/connectors',
            body: formData,
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)

        const saved = await connectorMetadataService(mockLog).getOrThrow({
            name: CONNECTOR_NAME,
            version: CONNECTOR_VERSION,
            tenantId: ctx.tenant.id,
        })
        expect(saved.name).toBe(CONNECTOR_NAME)
        expect(saved.version).toBe(CONNECTOR_VERSION)
        expect(saved.connectorType).toBe(ConnectorType.CUSTOM)
        expect(saved.packageType).toBe(PackageType.ARCHIVE)
        expect(saved.archiveId).toBeDefined()
    })

    it('should reject installation by a non-tenant-admin user', async () => {
        const ctx = await createTestContext(app!)
        const memberCtx = await createMemberContext(app!, ctx, { workspaceRole: DefaultWorkspaceRole.EDITOR })

        const formData = new FormData()
        formData.append(
            'connectorArchive',
            new Blob([tgzBuffer], { type: 'application/gzip' }),
            'private-connector-test.tgz',
        )
        formData.append('connectorName', CONNECTOR_NAME)
        formData.append('connectorVersion', CONNECTOR_VERSION)
        formData.append('packageType', PackageType.ARCHIVE)
        formData.append('scope', ConnectorScope.TENANT)

        const response = await memberCtx.inject({
            method: 'POST',
            url: '/api/v1/connectors',
            body: formData,
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
})
