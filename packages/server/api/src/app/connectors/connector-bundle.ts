import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { safeHttp } from '@fema-ipaas/server-utils'
import { ConnectorType, FileType, PackageType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { fileRepo } from '../file/file.service'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { connectorMetadataService } from './metadata/connector-metadata-service'

// Resolves a connector to a single downloadable link (see ADR 0002 — "Connectors are distributed as links").
// Official/registry connectors resolve to the CDN tarball when available, else to the npm tarball. Custom
// (ARCHIVE) connectors are served straight from the file store. Always tenant-scoped via the engine
// token's tenantId.
export const connectorBundle = (log: FastifyBaseLogger) => ({
    async resolve({ name, version, archiveId, tenantId, projectId }: ResolveParams): Promise<ConnectorBundleResolution> {
        // ARCHIVE connectors are addressed by archiveId — they may not be registered in metadata yet
        // (e.g. during EXTRACT_CONNECTOR_METADATA of a freshly uploaded .tgz). Scope to the token's
        // tenant so one tenant cannot read another's private archive.
        if (!isNil(archiveId)) {
            const file = await fileRepo().findOneBy({ id: archiveId, tenantId, type: FileType.PACKAGE_ARCHIVE })
            return isNil(file) ? { type: 'not-found' } : { type: 'stream', archiveId }
        }
        if (isNil(name) || isNil(version)) {
            return { type: 'not-found' }
        }
        const metadata = await connectorMetadataService(log).get({ name, version, tenantId, projectId })
        if (isNil(metadata)) {
            return { type: 'not-found' }
        }
        if (metadata.packageType === PackageType.ARCHIVE && !isNil(metadata.archiveId)) {
            return { type: 'stream', archiveId: metadata.archiveId }
        }
        // CDN only mirrors official connectors — dev/custom/private registry connectors may 404 there, so fall back to npm.
        if (metadata.connectorType === ConnectorType.OFFICIAL && system.getBoolean(AppSystemProp.USE_CDN_FOR_BUNDLES)) {
            const cdnUrl = cdnTarballUrl({ name, version })
            if (await cdnBundleExists({ url: cdnUrl, log })) {
                return { type: 'redirect', url: cdnUrl }
            }
        }
        return { type: 'redirect', url: npmTarballUrl({ name, version }) }
    },
})

function cdnTarballUrl({ name, version }: ConnectorRef): string {
    return `${CDN_CONNECTORS_URL}${name.replace('/', '-')}-${version}.tgz`
}

// Connector tarballs are immutable per (name, version), so a positive result is cached forever.
async function cdnBundleExists({ url, log }: CdnBundleExistsParams): Promise<boolean> {
    if (cdnVerifiedUrls.has(url)) {
        return true
    }
    const { data: response, error } = await tryCatch(() =>
        safeHttp.axios.head(url, { validateStatus: (status) => status < 500 }),
    )
    if (error !== null) {
        log.warn({ error, url }, '[connectorBundle] CDN bundle HEAD check failed, falling back to npm')
        return false
    }
    const exists = response.status >= 200 && response.status < 300
    if (exists) {
        cdnVerifiedUrls.add(url)
        return true
    }
    log.warn({ url, status: response.status }, '[connectorBundle] CDN bundle not served, falling back to npm')
    return false
}

function npmTarballUrl({ name, version }: ConnectorRef): string {
    const unscopedName = name.startsWith('@') ? name.split('/')[1] : name
    return `${NPM_REGISTRY_URL}/${name}/-/${unscopedName}-${version}.tgz`
}

const cdnVerifiedUrls = new Set<string>()

const NPM_REGISTRY_URL = 'https://registry.npmjs.org'
const CDN_CONNECTORS_URL = 'https://cdn.fema.local/connectors/bundled/'

type ConnectorRef = {
    name: string
    version: string
}

type CdnBundleExistsParams = {
    url: string
    log: FastifyBaseLogger
}

type ResolveParams = {
    name?: string
    version?: string
    archiveId?: string
    tenantId: string
    projectId: string
}

type ConnectorBundleResolution =
    | { type: 'redirect', url: string }
    | { type: 'stream', archiveId: string }
    | { type: 'not-found' }
