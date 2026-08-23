import { isNil } from '@fema/core-utils'
import { ApEnvironment, ConnectorType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { pubsub } from '../../helper/pubsub'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { ConnectorMetadataEntity, ConnectorMetadataSchema } from './connector-metadata-entity'
import { loadDevConnectorsIfEnabled } from './utils'

const repo = repoFactory(ConnectorMetadataEntity)
const environment = system.get<ApEnvironment>(AppSystemProp.ENVIRONMENT)
const isTestingEnvironment = environment === ApEnvironment.TESTING

let cachedRegistry: ConnectorRegistryEntry[] | null = null
let registryGeneration = 0

export const connectorCache = (log: FastifyBaseLogger) => {
    return {
        async setup(): Promise<void> {
            log.info('[connectorCache] Registry cache initialized')
            if (!isTestingEnvironment) {
                await pubsub.subscribe(CONNECTOR_REGISTRY_INVALIDATION_CHANNEL, () => {
                    cachedRegistry = null
                    registryGeneration++
                    log.debug('[connectorCache] Registry invalidated via pubsub')
                })
            }
        },

        async loadRegistry(): Promise<ConnectorRegistryEntry[]> {
            const persistedRegistry = await loadPersistedRegistry()
            const devConnectors = (await loadDevConnectorsIfEnabled(log)).map(toRegistryEntry)
            return [...persistedRegistry, ...devConnectors]
        },

        async invalidate(): Promise<void> {
            cachedRegistry = null
            registryGeneration++
            if (!isTestingEnvironment) {
                await pubsub.publish(CONNECTOR_REGISTRY_INVALIDATION_CHANNEL, '1')
            }
        },
    }
}

async function loadPersistedRegistry(): Promise<ConnectorRegistryEntry[]> {
    if (isTestingEnvironment) {
        return fetchRegistryFromDB()
    }
    if (!isNil(cachedRegistry)) {
        return cachedRegistry
    }
    const startGeneration = registryGeneration
    const result = await fetchRegistryFromDB()
    if (registryGeneration !== startGeneration) {
        return loadPersistedRegistry()
    }
    cachedRegistry = result
    return result
}

function toRegistryEntry(connector: ConnectorMetadataSchema): ConnectorRegistryEntry {
    return {
        name: connector.name,
        version: connector.version,
        minimumSupportedRelease: connector.minimumSupportedRelease,
        maximumSupportedRelease: connector.maximumSupportedRelease,
        platformId: connector.platformId,
        connectorType: connector.connectorType,
    }
}

async function fetchRegistryFromDB(): Promise<ConnectorRegistryEntry[]> {
    return repo()
        .createQueryBuilder('pm')
        .select(['pm."name"', 'pm."version"', 'pm."platformId"', 'pm."connectorType"', 'pm."minimumSupportedRelease"', 'pm."maximumSupportedRelease"'])
        .getRawMany<ConnectorRegistryEntry>()
}

export const CONNECTOR_REGISTRY_INVALIDATION_CHANNEL = 'connector-registry-invalidation'

export type ConnectorRegistryEntry = {
    platformId?: string
    connectorType: ConnectorType
    name: string
    version: string
    minimumSupportedRelease?: string
    maximumSupportedRelease?: string
}
