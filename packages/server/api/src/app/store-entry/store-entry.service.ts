import { apId, sanitizeObjectForPostgresql, WorkspaceId } from '@fema-ipaas/core-utils'
import { PutStoreEntryRequest, StoreEntry } from '@fema-ipaas/shared'
import { repoFactory } from '../core/db/repo-factory'
import { StoreEntryEntity } from './store-entry-entity'

const storeEntryRepo = repoFactory<StoreEntry>(StoreEntryEntity)

export const storeEntryService = {
    async upsert({ workspaceId, request }: { workspaceId: WorkspaceId, request: PutStoreEntryRequest }): Promise<StoreEntry | null> {
        const value = sanitizeObjectForPostgresql(request.value)
        const insertResult = await storeEntryRepo().upsert({
            id: apId(),
            key: request.key,
            value,
            workspaceId,
        }, ['workspaceId', 'key'])

        return {
            workspaceId,
            key: request.key,
            value,
            id: insertResult.identifiers[0].id,
            created: insertResult.generatedMaps[0].created,
            updated: insertResult.generatedMaps[0].updated,
        }
    },
    async getOne({
        workspaceId,
        key,
    }: {
        workspaceId: WorkspaceId
        key: string
    }): Promise<StoreEntry | null> {
        return storeEntryRepo().findOneBy({
            workspaceId,
            key,
        })
    },
    async delete({
        workspaceId,
        key,
    }: {
        workspaceId: WorkspaceId
        key: string
    }): Promise<void> {
        await storeEntryRepo().delete({
            workspaceId,
            key,
        })
    },
}