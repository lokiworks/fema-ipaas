import type { BaseModel, EntityId, WorkspaceId } from '@fema-ipaas/core-utils'

export type StoreEntryId = EntityId

export const STORE_KEY_MAX_LENGTH = 128
export const STORE_VALUE_MAX_SIZE = 512 * 1024

export type StoreEntry = {
    key: string
    workspaceId: WorkspaceId
    value: unknown
} & BaseModel<StoreEntryId>