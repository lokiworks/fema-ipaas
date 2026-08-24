import { STORE_KEY_MAX_LENGTH, StoreEntry } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
    EntityIdSchema,
} from '../database/database-common'

type StoreEntrySchema = StoreEntry

export const StoreEntryEntity = new EntitySchema<StoreEntrySchema>({
    name: 'store-entry',
    columns: {
        ...BaseColumnSchemaPart,
        key: {
            type: String,
            length: STORE_KEY_MAX_LENGTH,
        },
        workspaceId: EntityIdSchema,
        value: {
            type: 'jsonb',
            nullable: true,
        },
    },    
    uniques: [
        {
            columns: ['workspaceId', 'key'],
        },
    ],
})
