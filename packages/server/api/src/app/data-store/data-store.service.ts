import { ApplicationError, ErrorCode, generateId, isNil, ProjectId, tryCatch, UserId } from '@fema-ipaas/core-utils'
import { CreateDataStoreRequestBody, DataStore, DataStoreSummary, UpdateDataStoreRequestBody } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { storeEntryRepo } from '../store-entry/store-entry.service'
import { userRepo } from '../user/user-service'
import { dataStoreUtils } from './data-store-utils'
import { DataStoreEntity, DataStoreSchema } from './data-store.entity'

export const dataStoreRepo = repoFactory(DataStoreEntity)

export const dataStoreService = (log: FastifyBaseLogger) => ({
    async list({ projectId }: { projectId: ProjectId }): Promise<DataStoreSummary[]> {
        const stores = await dataStoreRepo().find({ where: { projectId }, order: { created: 'ASC' } })
        if (stores.length === 0) {
            return []
        }
        const counts = await recordCounts({ projectId })
        const ownerNames = await resolveOwnerNames({ ownerIds: stores.map((store) => store.ownerId) })
        return stores.map((store) => ({
            ...withoutRelations(store),
            recordCount: counts.get(store.id) ?? 0,
            ownerName: isNil(store.ownerId) ? null : ownerNames.get(store.ownerId) ?? null,
        }))
    },

    async getOneOrThrow({ id, projectId }: StoreRef): Promise<DataStore> {
        const store = await dataStoreRepo().findOneBy({ id, projectId })
        if (isNil(store)) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: id, entityType: 'DataStore' } })
        }
        return withoutRelations(store)
    },

    async getByName({ projectId, name }: { projectId: ProjectId, name: string }): Promise<DataStore | null> {
        const store = await dataStoreRepo().findOneBy({ projectId, name })
        return isNil(store) ? null : withoutRelations(store)
    },

    async create({ request, ownerId }: { request: CreateDataStoreRequestBody, ownerId: UserId }): Promise<DataStore> {
        await assertNameAvailable({ projectId: request.projectId, name: request.name, excludeId: null })
        const id = generateId()
        await insertOrRejectDuplicate(() => dataStoreRepo().insert({
            id,
            projectId: request.projectId,
            name: request.name,
            description: emptyToNull(request.description),
            ttlDays: request.ttlDays,
            ownerId,
        }))
        log.info({ project: { id: request.projectId }, dataStore: { id } }, '[dataStoreService#create] Data store created')
        return this.getOneOrThrow({ id, projectId: request.projectId })
    },

    async update({ id, projectId, request }: StoreRef & { request: UpdateDataStoreRequestBody }): Promise<DataStore> {
        await this.getOneOrThrow({ id, projectId })
        await assertNameAvailable({ projectId, name: request.name, excludeId: id })
        await insertOrRejectDuplicate(() => dataStoreRepo().update({ id, projectId }, {
            name: request.name,
            description: emptyToNull(request.description),
            ttlDays: request.ttlDays,
        }))
        return this.getOneOrThrow({ id, projectId })
    },

    async delete({ id, projectId }: StoreRef): Promise<DataStore> {
        const store = await this.getOneOrThrow({ id, projectId })
        await storeEntryRepo().delete({ projectId, dataStoreId: id })
        await dataStoreRepo().delete({ id, projectId })
        log.info({ project: { id: projectId }, dataStore: { id } }, '[dataStoreService#delete] Data store deleted')
        return store
    },

    async countByProject({ projectId }: { projectId: ProjectId }): Promise<number> {
        return dataStoreRepo().countBy({ projectId })
    },

    async copyStructure({ sourceProjectId, targetProjectId, ownerId }: { sourceProjectId: ProjectId, targetProjectId: ProjectId, ownerId: UserId }): Promise<number> {
        const sources = await dataStoreRepo().find({ where: { projectId: sourceProjectId }, order: { created: 'ASC' } })
        const taken = await dataStoreRepo().find({ where: { projectId: targetProjectId }, select: ['name'] })
        const takenNames = new Set(taken.map((store) => store.name))
        const copies = sources
            .filter((store) => !takenNames.has(store.name))
            .map((store) => ({
                id: generateId(),
                projectId: targetProjectId,
                name: store.name,
                description: store.description ?? null,
                ttlDays: store.ttlDays,
                ownerId,
            }))
        if (copies.length > 0) {
            await dataStoreRepo().insert(copies)
        }
        return copies.length
    },
})

async function recordCounts({ projectId }: { projectId: ProjectId }): Promise<Map<string, number>> {
    const rows = await storeEntryRepo()
        .createQueryBuilder('entry')
        .select('entry."dataStoreId"', 'dataStoreId')
        .addSelect('COUNT(*)', 'count')
        .where('entry."projectId" = :projectId', { projectId })
        .andWhere('entry."dataStoreId" IS NOT NULL')
        .groupBy('entry."dataStoreId"')
        .getRawMany<{ dataStoreId: string, count: string }>()
    return new Map(rows.map((row) => [row.dataStoreId, Number(row.count)]))
}

async function resolveOwnerNames({ ownerIds }: { ownerIds: (string | null | undefined)[] }): Promise<Map<string, string>> {
    const unique = [...new Set(ownerIds.filter((ownerId): ownerId is string => !isNil(ownerId)))]
    if (unique.length === 0) {
        return new Map()
    }
    const users = await userRepo().find({ where: { id: In(unique) }, relations: { identity: true } })
    return new Map(users.map((user): [string, string] => {
        const fullName = `${user.identity?.firstName ?? ''} ${user.identity?.lastName ?? ''}`.trim()
        return [user.id, fullName.length > 0 ? fullName : user.identity?.email ?? '']
    }))
}

async function assertNameAvailable({ projectId, name, excludeId }: { projectId: ProjectId, name: string, excludeId: string | null }): Promise<void> {
    const existing = await dataStoreRepo().findOneBy({ projectId, name })
    if (!isNil(existing) && existing.id !== excludeId) {
        throw nameTakenError()
    }
}

async function insertOrRejectDuplicate(write: () => Promise<unknown>): Promise<void> {
    const { error } = await tryCatch(write)
    if (isNil(error)) {
        return
    }
    if (dataStoreUtils.isUniqueViolation(error)) {
        throw nameTakenError()
    }
    throw error
}

function nameTakenError(): ApplicationError {
    return new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'dataStoreNameTaken' } })
}

function emptyToNull(value: string): string | null {
    return value.length === 0 ? null : value
}

function withoutRelations(store: DataStoreSchema): DataStore {
    return {
        id: store.id,
        created: store.created,
        updated: store.updated,
        projectId: store.projectId,
        name: store.name,
        description: store.description ?? null,
        ttlDays: store.ttlDays,
        ownerId: store.ownerId ?? null,
    }
}

type StoreRef = {
    id: string
    projectId: ProjectId
}
