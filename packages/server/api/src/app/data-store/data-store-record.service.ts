import { ApplicationError, ErrorCode, generateId, isNil, ProjectId, sanitizeObjectForPostgresql, tryCatch } from '@fema-ipaas/core-utils'
import {
    DATA_STORE_RECORDS_DEFAULT_LIMIT,
    DATA_STORE_VALUE_MAX_LENGTH,
    DataStore,
    DataStoreRecord,
    DataStoreRecordsPage,
    DataStoreRecordWriteMode,
    PutStoreEntryRequest,
    StoreEntry,
    UpsertDataStoreRecordRequestBody,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { ILike, In } from 'typeorm'
import { NAMED_STORE_INDEX_PREDICATE, StoreEntrySchema } from '../store-entry/store-entry-entity'
import { storeEntryRepo } from '../store-entry/store-entry.service'
import { dataStoreUtils, NamedStoreKey } from './data-store-utils'
import { dataStoreService } from './data-store.service'

export const dataStoreRecordService = (log: FastifyBaseLogger) => ({
    async list({ store, search, limit }: { store: DataStore, search: string | undefined, limit: number | undefined }): Promise<DataStoreRecordsPage> {
        const term = (search ?? '').trim()
        const [rows, total] = await storeEntryRepo().findAndCount({
            where: {
                projectId: store.projectId,
                dataStoreId: store.id,
                ...(term.length > 0 ? { key: ILike(`%${dataStoreUtils.escapeLikePattern(term)}%`) } : {}),
            },
            order: { updated: 'DESC' },
            take: limit ?? DATA_STORE_RECORDS_DEFAULT_LIMIT,
        })
        return { data: rows.map(toRecord), total }
    },

    async upsert({ store, request }: { store: DataStore, request: UpsertDataStoreRecordRequestBody }): Promise<DataStoreRecord> {
        const now = new Date()
        const expiresAt = dataStoreUtils.computeExpiresAt({ now, ttlDays: store.ttlDays }).toISOString()
        const existing = await findEntry({ store, key: request.key })
        if (request.mode === DataStoreRecordWriteMode.UPDATE && isNil(existing)) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: request.key, entityType: 'DataStoreRecord' } })
        }
        if (request.mode === DataStoreRecordWriteMode.CREATE && !isNil(existing) && !dataStoreUtils.isExpired({ expiresAt: existing.expiresAt, now })) {
            throw keyExistsError()
        }
        if (isNil(existing)) {
            const { error } = await tryCatch(() => storeEntryRepo().insert({
                id: generateId(),
                projectId: store.projectId,
                dataStoreId: store.id,
                key: request.key,
                value: request.value,
                expiresAt,
            }))
            if (!isNil(error)) {
                throw dataStoreUtils.isUniqueViolation(error) ? keyExistsError() : error
            }
        }
        else {
            await storeEntryRepo().update({ id: existing.id, projectId: store.projectId }, { value: request.value, expiresAt })
        }
        const saved = await findEntry({ store, key: request.key })
        if (isNil(saved)) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: request.key, entityType: 'DataStoreRecord' } })
        }
        return toRecord(saved)
    },

    async delete({ store, key }: { store: DataStore, key: string }): Promise<boolean> {
        const result = await storeEntryRepo().delete({ projectId: store.projectId, dataStoreId: store.id, key })
        return (result.affected ?? 0) > 0
    },

    async clear({ store }: { store: DataStore }): Promise<number> {
        const result = await storeEntryRepo().delete({ projectId: store.projectId, dataStoreId: store.id })
        log.info({ project: { id: store.projectId }, dataStore: { id: store.id }, count: result.affected ?? 0 }, '[dataStoreRecordService#clear] Data store cleared')
        return result.affected ?? 0
    },

    async getForEngine({ projectId, target, fullKey }: EngineParams): Promise<StoreEntry | null> {
        const store = await dataStoreService(log).getByName({ projectId, name: target.storeName })
        if (isNil(store)) {
            return null
        }
        const entry = await findEntry({ store, key: target.key })
        if (isNil(entry) || dataStoreUtils.isExpired({ expiresAt: entry.expiresAt, now: new Date() })) {
            return null
        }
        return toStoreEntry({ entry, fullKey })
    },

    async putForEngine({ projectId, target, fullKey, value }: EngineParams & { value: PutStoreEntryRequest['value'] }): Promise<StoreEntry> {
        const store = await requireStoreForEngine({ log, projectId, target })
        if (dataStoreUtils.valueLength(value) > DATA_STORE_VALUE_MAX_LENGTH) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: `Value for data store "${store.name}" is longer than ${DATA_STORE_VALUE_MAX_LENGTH} characters` },
            })
        }
        const sanitized = sanitizeObjectForPostgresql(value)
        const expiresAt = dataStoreUtils.computeExpiresAt({ now: new Date(), ttlDays: store.ttlDays }).toISOString()
        const result = await storeEntryRepo().upsert({
            id: generateId(),
            projectId,
            dataStoreId: store.id,
            key: target.key,
            value: sanitized,
            expiresAt,
        }, {
            conflictPaths: ['dataStoreId', 'key'],
            indexPredicate: NAMED_STORE_INDEX_PREDICATE,
        })
        return {
            id: result.identifiers[0].id,
            created: result.generatedMaps[0].created,
            updated: result.generatedMaps[0].updated,
            projectId,
            key: fullKey,
            value: sanitized,
        }
    },

    async deleteForEngine({ projectId, target }: Omit<EngineParams, 'fullKey'>): Promise<void> {
        const store = await requireStoreForEngine({ log, projectId, target })
        await this.delete({ store, key: target.key })
    },

    async purgeExpired(): Promise<number> {
        const purgeBatch = async (done: number): Promise<number> => {
            if (done >= MAX_PURGED_PER_RUN) {
                return done
            }
            const rows = await storeEntryRepo()
                .createQueryBuilder('entry')
                .select('entry.id', 'id')
                .where('entry."expiresAt" IS NOT NULL')
                .andWhere('entry."expiresAt" <= :now', { now: new Date().toISOString() })
                .limit(PURGE_BATCH_SIZE)
                .getRawMany<{ id: string }>()
            if (rows.length === 0) {
                return done
            }
            await storeEntryRepo().delete({ id: In(rows.map((row) => row.id)) })
            return rows.length < PURGE_BATCH_SIZE ? done + rows.length : purgeBatch(done + rows.length)
        }
        const purged = await purgeBatch(0)
        if (purged > 0) {
            log.info({ count: purged }, '[dataStoreRecordService#purgeExpired] Purged expired data store records')
        }
        return purged
    },
})

async function requireStoreForEngine({ log, projectId, target }: { log: FastifyBaseLogger, projectId: ProjectId, target: NamedStoreKey }): Promise<DataStore> {
    const store = await dataStoreService(log).getByName({ projectId, name: target.storeName })
    if (isNil(store)) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: `Data store "${target.storeName}" does not exist in this project` },
        })
    }
    return store
}

async function findEntry({ store, key }: { store: DataStore, key: string }): Promise<StoreEntrySchema | null> {
    return storeEntryRepo().findOneBy({ projectId: store.projectId, dataStoreId: store.id, key })
}

function toRecord(entry: StoreEntrySchema): DataStoreRecord {
    return {
        key: entry.key,
        value: entry.value,
        updated: new Date(entry.updated).toISOString(),
        expiresAt: isNil(entry.expiresAt) ? null : new Date(entry.expiresAt).toISOString(),
    }
}

function toStoreEntry({ entry, fullKey }: { entry: StoreEntrySchema, fullKey: string }): StoreEntry {
    return {
        id: entry.id,
        created: entry.created,
        updated: entry.updated,
        projectId: entry.projectId,
        key: fullKey,
        value: entry.value,
    }
}

function keyExistsError(): ApplicationError {
    return new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'dataStoreKeyExists' } })
}

const PURGE_BATCH_SIZE = 1000
const MAX_PURGED_PER_RUN = 100000

type EngineParams = {
    projectId: ProjectId
    target: NamedStoreKey
    fullKey: string
}
