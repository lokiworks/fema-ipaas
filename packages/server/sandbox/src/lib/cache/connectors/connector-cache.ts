import path from 'path'
import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'
import { type ApLogger, wideEvent } from '@fema-ipaas/server-utils'
import { ApEnvironment, ConnectorPackage, ConnectorType, EXACT_VERSION_REGEX, PackageType, WorkerToApiContract } from '@fema-ipaas/shared'
import { SandboxSettings } from '../../types'
import { cacheUtils } from '../cache-paths'
import { cacheState, NO_SAVE_GUARD } from '../cache-state'
import { isValidPackageName } from './connector-installer'

export const connectorCache = (log: ApLogger, apiClient: WorkerToApiContract, basePath: string, getSettings: () => SandboxSettings) => ({
    async getConnector({ connectorName, connectorVersion, tenantId }: ConnectorCacheKey): Promise<ConnectorPackage> {
        if (!isValidPackageName(connectorName)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: `Invalid connectorName: "${connectorName}" is not a valid package name` },
            })
        }
        const isExactVersion = EXACT_VERSION_REGEX.test(connectorVersion)

        if (!isExactVersion) {
            return getConnectorPackage({ connectorName, connectorVersion, tenantId }, apiClient)
        }

        const cacheKey = `${connectorName}-${connectorVersion}-${tenantId}`
        const cache = cacheState(path.join(cacheUtils(basePath).getGlobalCacheConnectorsPath(), cacheKey))

        const { state, cacheHit } = await cache.getOrSetCache({
            key: cacheKey,
            cacheMiss: (_: string) => {
                const environment = getSettings().ENVIRONMENT
                if (environment === ApEnvironment.TESTING) {
                    return true
                }
                const devConnectors = getSettings().DEV_CONNECTORS
                if (devConnectors.includes(connectorName)) {
                    return true
                }
                return false
            },
            installFn: async () => {
                return wideEvent.timed({
                    name: 'connectorFetch',
                    fn: async () => {
                        const connectorPackage = await getConnectorPackage({ connectorName, connectorVersion, tenantId }, apiClient)
                        log.info({ connector: { name: connectorName, version: connectorVersion }, tenant: { id: tenantId } }, 'Cached connector')
                        return JSON.stringify(connectorPackage)
                    },
                })
            },
            skipSave: NO_SAVE_GUARD,
        })

        wideEvent.set({ connectorCacheHit: cacheHit })

        return JSON.parse(state as string) as ConnectorPackage
    },
})

async function getConnectorPackage(query: ConnectorCacheKey, apiClient: WorkerToApiContract): Promise<ConnectorPackage> {
    const connectorMetadata = await apiClient.getConnector({
        name: query.connectorName,
        version: query.connectorVersion,
        tenantId: query.tenantId,
    }) as { packageType: PackageType, name: string, version: string, connectorType: ConnectorType, archiveId?: string } | null

    if (!connectorMetadata) {
        throw new ConnectorNotFoundError(query.connectorName, query.connectorVersion)
    }

    const baseProps = {
        packageType: connectorMetadata.packageType,
        connectorName: connectorMetadata.name,
        connectorVersion: connectorMetadata.version,
        connectorType: connectorMetadata.connectorType,
    }

    if (connectorMetadata.packageType === PackageType.ARCHIVE) {
        return {
            ...baseProps,
            archiveId: connectorMetadata.archiveId!,
            tenantId: query.tenantId,
        } as ConnectorPackage
    }

    if (connectorMetadata.connectorType === ConnectorType.CUSTOM) {
        return {
            ...baseProps,
            tenantId: query.tenantId,
        } as ConnectorPackage
    }

    return baseProps as ConnectorPackage
}

export class ConnectorNotFoundError extends Error {
    constructor(readonly connectorName: string, readonly connectorVersion: string) {
        super(`Connector metadata not found for ${connectorName}@${connectorVersion}`)
        this.name = 'ConnectorNotFoundError'
    }
}

type ConnectorCacheKey = {
    connectorName: string
    connectorVersion: string
    tenantId: string
}
