import type { BaseModel, EntityId, ProjectId } from '@fema-ipaas/core-utils'

export type StoreEntryId = EntityId

export const STORE_KEY_MAX_LENGTH = 128
export const STORE_VALUE_MAX_SIZE = 512 * 1024

export type StoreEntry = {
    key: string
    projectId: ProjectId
    value: unknown
} & BaseModel<StoreEntryId>