import { apId, isEmpty, isNil } from '@fema-ipaas/core-utils'
import { ConnectorType, PackageType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import semVer from 'semver'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { ConnectorRegistryEntry } from '../connector-cache'
import { ConnectorMetadataSchema } from '../connector-metadata-entity'
import { fileConnectorsUtils } from './file-connectors-utils'

export function isNewerVersion(a: string, b: string): boolean {
    const aValid = semVer.valid(a)
    const bValid = semVer.valid(b)
    if (!aValid && !bValid) {
        return a.localeCompare(b) > 0
    }
    if (!aValid) {
        return false
    }
    if (!bValid) {
        return true
    }
    return semVer.gt(a, b)
}

export function lastVersionOfEachConnector(connectors: ConnectorMetadataSchema[]): ConnectorMetadataSchema[] {
    const seen = new Map<string, ConnectorMetadataSchema>()
    for (const connector of connectors) {
        const existing = seen.get(connector.name)
        if (isNil(existing) || isNewerVersion(connector.version, existing.version)) {
            seen.set(connector.name, connector)
        }
    }
    return Array.from(seen.values())
}

let devConnectorsCachePromise: Promise<ConnectorMetadataSchema[]> | null = null

export function invalidateDevConnectorCache(): void {
    devConnectorsCachePromise = null
}

export async function loadDevConnectorsIfEnabled(log: FastifyBaseLogger): Promise<ConnectorMetadataSchema[]> {
    const devConnectorsConfig = system.get(AppSystemProp.DEV_CONNECTORS)
    if (isNil(devConnectorsConfig) || isEmpty(devConnectorsConfig)) {
        return []
    }
    if (devConnectorsCachePromise) {
        return devConnectorsCachePromise
    }
    devConnectorsCachePromise = loadDevConnectors(log, devConnectorsConfig)
    devConnectorsCachePromise.catch(() => {
        devConnectorsCachePromise = null
    })
    return devConnectorsCachePromise
}

async function loadDevConnectors(log: FastifyBaseLogger, devConnectorsConfig: string): Promise<ConnectorMetadataSchema[]> {
    const connectorsNames = devConnectorsConfig.split(',')
    const connectors = await fileConnectorsUtils(log).loadDistConnectorsMetadata(connectorsNames)

    return connectors.map((p): ConnectorMetadataSchema => ({
        id: apId(),
        ...p,
        workspaceUsage: 0,
        connectorType: ConnectorType.OFFICIAL,
        packageType: PackageType.REGISTRY,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
    }))
}

export function filterConnectorBasedOnType(tenantId: string | undefined, connector: ConnectorMetadataSchema | ConnectorRegistryEntry): boolean {
    return isOfficialConnector(connector) || isCustomConnector(tenantId, connector)
}

export function isOfficialConnector(connector: ConnectorMetadataSchema | ConnectorRegistryEntry): boolean {
    return connector.connectorType === ConnectorType.OFFICIAL && isNil(connector.tenantId)
}

export function isCustomConnector(tenantId: string | undefined, connector: ConnectorMetadataSchema | ConnectorRegistryEntry): boolean {
    if (isNil(tenantId)) {
        return false
    }
    return connector.tenantId === tenantId && connector.connectorType === ConnectorType.CUSTOM
}

export function isSupportedRelease(release: string | undefined, connector: { minimumSupportedRelease?: string, maximumSupportedRelease?: string }): boolean {
    if (isNil(release) || !semVer.valid(release)) {
        return true
    }
    if (!isNil(connector.maximumSupportedRelease) && semVer.valid(connector.maximumSupportedRelease) && semVer.compare(release, connector.maximumSupportedRelease) === 1) {
        return false
    }
    if (!isNil(connector.minimumSupportedRelease) && semVer.valid(connector.minimumSupportedRelease) && semVer.compare(release, connector.minimumSupportedRelease) === -1) {
        return false
    }
    return true
}
