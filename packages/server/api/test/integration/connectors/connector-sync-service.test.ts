import { LATEST_CONTEXT_VERSION } from '@fema-ipaas/connector-sdk'
import {
    ConnectorSource,
    PackageType,
    ConnectorType,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { connectorMetadataService } from '../../../src/app/connectors/metadata/connector-metadata-service'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'


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

describe('Connector Metadata Create', () => {
    it('should insert a connector via create', async () => {
        const service = connectorMetadataService(mockLog)

        await service.create({
            connectorMetadata: {
                name: 'connector-a',
                displayName: 'Connector A',
                description: 'Connector A',
                version: '1.0.0',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '9.9.9',
                actions: {},
                triggers: {},
                authors: [],
                logoUrl: 'https://example.com/logo.png',
                contextInfo: { version: LATEST_CONTEXT_VERSION },
            },
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
            source: ConnectorSource.OFFICIAL,
            publishCacheRefresh: false,
        })

        const repo = databaseConnection().getRepository('connector_metadata')
        const allConnectors = await repo.find()
        expect(allConnectors).toHaveLength(1)
        expect(allConnectors[0].name).toBe('connector-a')
    })

    it('should reject duplicate connector creation', async () => {
        const service = connectorMetadataService(mockLog)

        await service.create({
            connectorMetadata: {
                name: 'connector-dup',
                displayName: 'Connector Dup',
                description: 'Connector Dup',
                version: '1.0.0',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '9.9.9',
                actions: {},
                triggers: {},
                authors: [],
                logoUrl: 'https://example.com/logo.png',
                contextInfo: { version: LATEST_CONTEXT_VERSION },
            },
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
            source: ConnectorSource.OFFICIAL,
            publishCacheRefresh: false,
        })

        await expect(service.create({
            connectorMetadata: {
                name: 'connector-dup',
                displayName: 'Connector Dup',
                description: 'Connector Dup',
                version: '1.0.0',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '9.9.9',
                actions: {},
                triggers: {},
                authors: [],
                logoUrl: 'https://example.com/logo.png',
                contextInfo: { version: LATEST_CONTEXT_VERSION },
            },
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
            source: ConnectorSource.OFFICIAL,
            publishCacheRefresh: false,
        })).rejects.toThrow()
    })

    it('should bulk delete connectors', async () => {
        const service = connectorMetadataService(mockLog)

        await service.create({
            connectorMetadata: {
                name: 'delete-me',
                displayName: 'Delete Me',
                description: 'Delete Me',
                version: '1.0.0',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '9.9.9',
                actions: {},
                triggers: {},
                authors: [],
                logoUrl: 'https://example.com/logo.png',
                contextInfo: { version: LATEST_CONTEXT_VERSION },
            },
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
            source: ConnectorSource.OFFICIAL,
            publishCacheRefresh: false,
        })

        await service.create({
            connectorMetadata: {
                name: 'keep-me',
                displayName: 'Keep Me',
                description: 'Keep Me',
                version: '1.0.0',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '9.9.9',
                actions: {},
                triggers: {},
                authors: [],
                logoUrl: 'https://example.com/logo.png',
                contextInfo: { version: LATEST_CONTEXT_VERSION },
            },
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
            source: ConnectorSource.OFFICIAL,
            publishCacheRefresh: false,
        })

        await service.bulkDelete([{ name: 'delete-me', version: '1.0.0' }])

        const repo = databaseConnection().getRepository('connector_metadata')
        const allConnectors = await repo.find()
        expect(allConnectors).toHaveLength(1)
        expect(allConnectors[0].name).toBe('keep-me')
    })
})
