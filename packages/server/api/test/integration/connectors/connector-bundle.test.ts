import { generateId } from '@fema-ipaas/core-utils'
import { FileCompression, FileLocation, FileType, PackageType, ConnectorType, Principal, PrincipalType } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import { createMockFile, createMockConnectorMetadata, mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function engineToken(projectId: string, tenantId: string): Promise<string> {
    const principal: Principal = {
        id: generateId(),
        type: PrincipalType.ENGINE,
        projectId,
        tenant: { id: tenantId },
    }
    return generateMockToken(principal)
}

function bundleRequest(name: string, version: string, token: string) {
    return {
        method: 'GET' as const,
        url: `/api/v1/engine/connectors/bundle?name=${encodeURIComponent(name)}&version=${version}`,
        headers: { authorization: `Bearer ${token}` },
    }
}

describe('Connector Bundle Endpoint', () => {
    it('rejects an invalid engine token with 401', async () => {
        const response = await app!.inject(bundleRequest('@fema-ipaas/connector-anything', '1.0.0', 'not-a-real-token'))
        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('redirects a registry connector to the npm tarball, never to our own S3', async () => {
        const { mockTenant, mockProject } = await mockAndSaveBasicSetup()
        await db.save('connector_metadata', createMockConnectorMetadata({
            name: '@fema-ipaas/connector-bundle-official',
            version: '1.2.3',
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
            tenantId: undefined,
        }))
        const token = await engineToken(mockProject.id, mockTenant.id)

        const response = await app!.inject(bundleRequest('@fema-ipaas/connector-bundle-official', '1.2.3', token))

        expect(response.statusCode).toBe(StatusCodes.TEMPORARY_REDIRECT)
        expect(response.headers.location).toContain('registry.npmjs.org')
        expect(response.headers.location).toContain('connector-bundle-official-1.2.3.tgz')
    })

    it('scopes custom connectors by the token tenant: owner can fetch, other tenant gets 404', async () => {
        const tenantA = await mockAndSaveBasicSetup()
        const tenantB = await mockAndSaveBasicSetup()

        const archiveId = generateId()
        await db.save('file', createMockFile({
            id: archiveId,
            tenantId: tenantA.mockTenant.id,
            projectId: null,
            type: FileType.PACKAGE_ARCHIVE,
            location: FileLocation.DB,
            compression: FileCompression.NONE,
            data: Buffer.from('fake-tgz-bytes'),
        }))
        await db.save('connector_metadata', createMockConnectorMetadata({
            name: '@acme/connector-private',
            version: '0.0.1',
            packageType: PackageType.ARCHIVE,
            connectorType: ConnectorType.CUSTOM,
            tenantId: tenantA.mockTenant.id,
            archiveId,
        }))

        const tokenA = await engineToken(tenantA.mockProject.id, tenantA.mockTenant.id)
        const tokenB = await engineToken(tenantB.mockProject.id, tenantB.mockTenant.id)

        const ownerResponse = await app!.inject(bundleRequest('@acme/connector-private', '0.0.1', tokenA))
        expect(ownerResponse.statusCode).toBe(StatusCodes.OK)
        expect(ownerResponse.rawPayload.toString()).toBe('fake-tgz-bytes')

        const otherTenantResponse = await app!.inject(bundleRequest('@acme/connector-private', '0.0.1', tokenB))
        expect(otherTenantResponse.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('streams an archive by archiveId for the owning tenant and 404s for others', async () => {
        const tenantA = await mockAndSaveBasicSetup()
        const tenantB = await mockAndSaveBasicSetup()

        const archiveId = generateId()
        await db.save('file', createMockFile({
            id: archiveId,
            tenantId: tenantA.mockTenant.id,
            projectId: null,
            type: FileType.PACKAGE_ARCHIVE,
            location: FileLocation.DB,
            compression: FileCompression.NONE,
            data: Buffer.from('archive-bytes'),
        }))

        const tokenA = await engineToken(tenantA.mockProject.id, tenantA.mockTenant.id)
        const tokenB = await engineToken(tenantB.mockProject.id, tenantB.mockTenant.id)
        const byArchive = (token: string) => ({
            method: 'GET' as const,
            url: `/api/v1/engine/connectors/bundle?archiveId=${archiveId}`,
            headers: { authorization: `Bearer ${token}` },
        })

        const ownerResponse = await app!.inject(byArchive(tokenA))
        expect(ownerResponse.statusCode).toBe(StatusCodes.OK)
        expect(ownerResponse.rawPayload.toString()).toBe('archive-bytes')

        const otherTenantResponse = await app!.inject(byArchive(tokenB))
        expect(otherTenantResponse.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
})
