import { ConnectorMetadataModel } from '@fema-ipaas/connector-sdk'
import { groupBy, isNil, tryCatch } from '@fema-ipaas/core-utils'
import { apVersionUtil, safeHttp } from '@fema-ipaas/server-utils'
import { ConnectorSyncMode, ConnectorType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import semver from 'semver'
import { rejectedPromiseHandler } from '../helper/promise-handler'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { connectorCache } from './metadata/connector-cache'
import { ConnectorMetadataSchema } from './metadata/connector-metadata-entity'
import { connectorMetadataService, connectorRepos } from './metadata/connector-metadata-service'

const registrySourceUrl = (): string | null => {
    const configured = system.get(AppSystemProp.CONNECTOR_REGISTRY_URL)
    return isNil(configured) || configured.trim() === '' ? null : configured.replace(/\/+$/, '')
}
const syncMode = system.get<ConnectorSyncMode>(AppSystemProp.CONNECTORS_SYNC_MODE)

export const connectorSyncService = (log: FastifyBaseLogger) => ({
    async setup(): Promise<void> {
        systemJobHandlers.registerJobHandler(SystemJobName.CONNECTORS_SYNC, async function syncConnectorsJobHandler(): Promise<void> {
            await connectorSyncService(log).sync({ publishCacheRefresh: true })
        })
        rejectedPromiseHandler(connectorSyncService(log).sync({ publishCacheRefresh: false }), log)
        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.CONNECTORS_SYNC,
                data: {},
                jobId: SystemJobName.CONNECTORS_SYNC,
            },
            schedule: {
                type: 'repeated',
                cron: `${Math.floor(Math.random() * 5)} */1 * * *`,
            },
        })
    },
    async sync({ publishCacheRefresh }: { publishCacheRefresh: boolean }): Promise<void> {
        if (syncMode !== ConnectorSyncMode.OFFICIAL_AUTO) {
            log.info('Connector sync service is disabled')
            return
        }
        try {
            log.info('Starting connector synchronization')
            const startTime = performance.now()
            const [dbConnectors, cloudConnectors] = await Promise.all([connectorRepos().find({
                select: {
                    name: true,
                    version: true,
                    connectorType: true,
                },
            }), listCloudConnectors()])
            log.info({ dbCount: dbConnectors.length, cloudCount: cloudConnectors.length }, 'Fetched connectors from DB and Cloud')
            const added = await installNewConnectors(cloudConnectors, dbConnectors, log, publishCacheRefresh)
            const deleted = await deleteConnectorsIfNotOnCloud(dbConnectors, cloudConnectors, log)

            log.info({
                added,
                deleted,
                durationMs: Math.floor(performance.now() - startTime),
            }, 'Connector synchronization completed')

            // React to the catalog-change signal: enqueue an async tool-search reconcile (never inline
            // — embedding must not block sync). The hash-gate means an unchanged catalog re-embeds
            // nothing, so this is cheap; only fire when something changed AND the engine is enabled —
            // without the flag guard a delta would enqueue a reconcile even when tool-search is off,
            // which (if an OpenAI key exists but pgvector does not) crashes silently on every change.
        }
        catch (error) {
            log.error({ error }, 'Error syncing connectors')
        }
    },
})

async function deleteConnectorsIfNotOnCloud(dbConnectors: ConnectorMetadataOnly[], cloudConnectors: ConnectorRegistryResponse[], log: FastifyBaseLogger): Promise<number> {
    const cloudMap = new Map<string, true>(cloudConnectors.map(cloudConnector => [`${cloudConnector.name}:${cloudConnector.version}`, true]))
    const connectorsToDelete = dbConnectors.filter(connector => connector.connectorType === ConnectorType.OFFICIAL && !cloudMap.has(`${connector.name}:${connector.version}`))
    await connectorMetadataService(log).bulkDelete(connectorsToDelete.map(connector => ({ name: connector.name, version: connector.version })))
    return connectorsToDelete.length
}

async function installNewConnectors(cloudConnectors: ConnectorRegistryResponse[], dbConnectors: ConnectorMetadataOnly[], log: FastifyBaseLogger, _publishCacheRefresh: boolean): Promise<number> {
    const dbMap = new Map<string, true>(dbConnectors.map(dbConnector => [`${dbConnector.name}:${dbConnector.version}`, true]))
    const newConnectorsToFetch = cloudConnectors.filter(connector => !dbMap.has(`${connector.name}:${connector.version}`))
    const batchSize = 5
    for (let done = 0; done < newConnectorsToFetch.length; done += batchSize) {
        const currentBatch = newConnectorsToFetch.slice(done, done + batchSize)
        await Promise.all(currentBatch.map(async (connector) => {
            const base = registrySourceUrl()
            if (isNil(base)) {
                return
            }
            const url = `${base}/${connector.name}${connector.version ? '?version=' + connector.version : ''}`
            const { data: connectorMetadata, error: fetchError } = await tryCatch(() => safeHttp.axios.get<ConnectorMetadataModel>(url).then((res) => res.data))
            if (!isNil(fetchError) || isNil(connectorMetadata)) {
                log.warn({ connector: { name: connector.name, version: connector.version }, error: fetchError }, '[connectorSyncService#installNewConnectors] Error reading connector metadata')
                return
            }
            const { error } = await tryCatch(() => connectorMetadataService(log).create({
                connectorMetadata,
                packageType: connectorMetadata.packageType,
                connectorType: connectorMetadata.connectorType,
                publishCacheRefresh: false,
            }))
            if (error) {
                log.debug({ connector: { name: connector.name, version: connector.version } }, '[connectorSyncService#installNewConnectors] Connector already exists, skipping')
            }
        }))
    }
    if (newConnectorsToFetch.length > 0) {
        await connectorCache(log).invalidate()
    }
    return newConnectorsToFetch.length
}


async function listCloudConnectors(): Promise<ConnectorRegistryResponse[]> {
    const queryParams = new URLSearchParams()
    queryParams.append('release', apVersionUtil.getCurrentRelease())
    const base = registrySourceUrl()
    if (isNil(base)) {
        return []
    }
    const response = await safeHttp.axios.get<ConnectorRegistryResponse[]>(`${base}/registry?${queryParams.toString()}`)
    const connectors = response.data
    const connectorsByName = groupBy(connectors, p => p.name)
    const latest = []
    const others = []

    for (const group of Object.values(connectorsByName)) {
        const sortedByVersion = sortByVersionDesc(group)
        latest.push(sortedByVersion[0])
        others.push(...sortedByVersion.slice(1))
    }

    return [...latest, ...others]
}

function sortByVersionDesc(items: ConnectorRegistryResponse[]) {
    return [...items].sort((a, b) =>
        semver.rcompare(a.version, b.version),
    )
}

type ConnectorRegistryResponse = {
    name: string
    version: string
}


type ConnectorMetadataOnly = Pick<ConnectorMetadataSchema, 'name' | 'version' | 'connectorType'>
