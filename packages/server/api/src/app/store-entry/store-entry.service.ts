import { generateId, ProjectId, sanitizeObjectForPostgresql } from '@fema-ipaas/core-utils'
import { PutStoreEntryRequest, StoreEntry } from '@fema-ipaas/shared'
import { IsNull } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { IMPLICIT_STORE_INDEX_PREDICATE, StoreEntryEntity, StoreEntrySchema } from './store-entry-entity'

export const storeEntryRepo = repoFactory<StoreEntrySchema>(StoreEntryEntity)

export const storeEntryService = {
    async upsert({ projectId, request }: { projectId: ProjectId, request: PutStoreEntryRequest }): Promise<StoreEntry | null> {
        const value = sanitizeObjectForPostgresql(request.value)
        const insertResult = await storeEntryRepo().upsert({
            id: generateId(),
            key: request.key,
            value,
            projectId,
        }, {
            conflictPaths: ['projectId', 'key'],
            indexPredicate: IMPLICIT_STORE_INDEX_PREDICATE,
        })

        return {
            projectId,
            key: request.key,
            value,
            id: insertResult.identifiers[0].id,
            created: insertResult.generatedMaps[0].created,
            updated: insertResult.generatedMaps[0].updated,
        }
    },
    async getOne({
        projectId,
        key,
    }: {
        projectId: ProjectId
        key: string
    }): Promise<StoreEntry | null> {
        const entry = await storeEntryRepo().findOneBy({
            projectId,
            key,
            dataStoreId: IsNull(),
        })
        if (entry === null) {
            return null
        }
        return {
            id: entry.id,
            created: entry.created,
            updated: entry.updated,
            projectId: entry.projectId,
            key: entry.key,
            value: entry.value,
        }
    },
    async delete({
        projectId,
        key,
    }: {
        projectId: ProjectId
        key: string
    }): Promise<void> {
        await storeEntryRepo().delete({
            projectId,
            key,
            dataStoreId: IsNull(),
        })
    },
}
