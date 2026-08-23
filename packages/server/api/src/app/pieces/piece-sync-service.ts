import { groupBy, isNil, tryCatch } from '@activepieces/core-utils'
import { apVersionUtil, safeHttp } from '@activepieces/server-utils'
import { PieceSyncMode, PieceType } from '@activepieces/shared'
import { PieceMetadataModel } from '@activepieces/pieces-framework'
import { FastifyBaseLogger } from 'fastify'
import semver from 'semver'
import { rejectedPromiseHandler } from '../helper/promise-handler'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { pieceCache } from './metadata/piece-cache'
import { PieceMetadataSchema } from './metadata/piece-metadata-entity'
import { pieceMetadataService, pieceRepos } from './metadata/piece-metadata-service'

const registrySourceUrl = (): string | null => {
    const configured = system.get(AppSystemProp.CONNECTOR_REGISTRY_URL)
    return isNil(configured) || configured.trim() === '' ? null : configured.replace(/\/+$/, '')
}
const syncMode = system.get<PieceSyncMode>(AppSystemProp.PIECES_SYNC_MODE)

export const pieceSyncService = (log: FastifyBaseLogger) => ({
    async setup(): Promise<void> {
        systemJobHandlers.registerJobHandler(SystemJobName.PIECES_SYNC, async function syncPiecesJobHandler(): Promise<void> {
            await pieceSyncService(log).sync({ publishCacheRefresh: true })
        })
        rejectedPromiseHandler(pieceSyncService(log).sync({ publishCacheRefresh: false }), log)
        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.PIECES_SYNC,
                data: {},
                jobId: SystemJobName.PIECES_SYNC,
            },
            schedule: {
                type: 'repeated',
                cron: `${Math.floor(Math.random() * 5)} */1 * * *`,
            },
        })
    },
    async sync({ publishCacheRefresh }: { publishCacheRefresh: boolean }): Promise<void> {
        if (syncMode !== PieceSyncMode.OFFICIAL_AUTO) {
            log.info('Piece sync service is disabled')
            return
        }
        try {
            log.info('Starting piece synchronization')
            const startTime = performance.now()
            const [dbPieces, cloudPieces] = await Promise.all([pieceRepos().find({
                select: {
                    name: true,
                    version: true,
                    pieceType: true,
                },
            }), listCloudPieces()])
            log.info({ dbCount: dbPieces.length, cloudCount: cloudPieces.length }, 'Fetched pieces from DB and Cloud')
            const added = await installNewPieces(cloudPieces, dbPieces, log, publishCacheRefresh)
            const deleted = await deletePiecesIfNotOnCloud(dbPieces, cloudPieces, log)

            log.info({
                added,
                deleted,
                durationMs: Math.floor(performance.now() - startTime),
            }, 'Piece synchronization completed')

            // React to the catalog-change signal: enqueue an async tool-search reconcile (never inline
            // — embedding must not block sync). The hash-gate means an unchanged catalog re-embeds
            // nothing, so this is cheap; only fire when something changed AND the engine is enabled —
            // without the flag guard a delta would enqueue a reconcile even when tool-search is off,
            // which (if an OpenAI key exists but pgvector does not) crashes silently on every change.
        }
        catch (error) {
            log.error({ error }, 'Error syncing pieces')
        }
    },
})

async function deletePiecesIfNotOnCloud(dbPieces: PieceMetadataOnly[], cloudPieces: PieceRegistryResponse[], log: FastifyBaseLogger): Promise<number> {
    const cloudMap = new Map<string, true>(cloudPieces.map(cloudPiece => [`${cloudPiece.name}:${cloudPiece.version}`, true]))
    const piecesToDelete = dbPieces.filter(piece => piece.pieceType === PieceType.OFFICIAL && !cloudMap.has(`${piece.name}:${piece.version}`))
    await pieceMetadataService(log).bulkDelete(piecesToDelete.map(piece => ({ name: piece.name, version: piece.version })))
    return piecesToDelete.length
}

async function installNewPieces(cloudPieces: PieceRegistryResponse[], dbPieces: PieceMetadataOnly[], log: FastifyBaseLogger, _publishCacheRefresh: boolean): Promise<number> {
    const dbMap = new Map<string, true>(dbPieces.map(dbPiece => [`${dbPiece.name}:${dbPiece.version}`, true]))
    const newPiecesToFetch = cloudPieces.filter(piece => !dbMap.has(`${piece.name}:${piece.version}`))
    const batchSize = 5
    for (let done = 0; done < newPiecesToFetch.length; done += batchSize) {
        const currentBatch = newPiecesToFetch.slice(done, done + batchSize)
        await Promise.all(currentBatch.map(async (piece) => {
            const base = registrySourceUrl()
            if (isNil(base)) {
                return
            }
            const url = `${base}/${piece.name}${piece.version ? '?version=' + piece.version : ''}`
            const { data: pieceMetadata, error: fetchError } = await tryCatch(() => safeHttp.axios.get<PieceMetadataModel>(url).then((res) => res.data))
            if (!isNil(fetchError) || isNil(pieceMetadata)) {
                log.warn({ piece: { name: piece.name, version: piece.version }, error: fetchError }, '[pieceSyncService#installNewPieces] Error reading piece metadata')
                return
            }
            const { error } = await tryCatch(() => pieceMetadataService(log).create({
                pieceMetadata,
                packageType: pieceMetadata.packageType,
                pieceType: pieceMetadata.pieceType,
                publishCacheRefresh: false,
            }))
            if (error) {
                log.debug({ piece: { name: piece.name, version: piece.version } }, '[pieceSyncService#installNewPieces] Piece already exists, skipping')
            }
        }))
    }
    if (newPiecesToFetch.length > 0) {
        await pieceCache(log).invalidate()
    }
    return newPiecesToFetch.length
}


async function listCloudPieces(): Promise<PieceRegistryResponse[]> {
    const queryParams = new URLSearchParams()
    queryParams.append('edition', system.getEdition())
    queryParams.append('release', apVersionUtil.getCurrentRelease())
    const base = registrySourceUrl()
    if (isNil(base)) {
        return []
    }
    const response = await safeHttp.axios.get<PieceRegistryResponse[]>(`${base}/registry?${queryParams.toString()}`)
    const pieces = response.data
    const piecesByName = groupBy(pieces, p => p.name)
    const latest = []
    const others = []

    for (const group of Object.values(piecesByName)) {
        const sortedByVersion = sortByVersionDesc(group)
        latest.push(sortedByVersion[0])
        others.push(...sortedByVersion.slice(1))
    }

    return [...latest, ...others]
}

function sortByVersionDesc(items: PieceRegistryResponse[]) {
    return [...items].sort((a, b) =>
        semver.rcompare(a.version, b.version),
    )
}

type PieceRegistryResponse = {
    name: string
    version: string
}


type PieceMetadataOnly = Pick<PieceMetadataSchema, 'name' | 'version' | 'pieceType'>
