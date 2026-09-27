import { STORE_KEY_MAX_LENGTH, StoreEntry } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
    EntityIdSchema,
} from '../database/database-common'

export const StoreEntryEntity = new EntitySchema<StoreEntrySchema>({
    name: 'store-entry',
    columns: {
        ...BaseColumnSchemaPart,
        key: {
            type: String,
            length: STORE_KEY_MAX_LENGTH,
        },
        projectId: EntityIdSchema,
        value: {
            type: 'jsonb',
            nullable: true,
        },
        dataStoreId: {
            ...EntityIdSchema,
            nullable: true,
        },
        expiresAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_store_entry_project_id_key',
            columns: ['projectId', 'key'],
            unique: true,
            where: '"dataStoreId" IS NULL',
        },
        {
            name: 'idx_store_entry_data_store_id_key',
            columns: ['dataStoreId', 'key'],
            unique: true,
            where: '"dataStoreId" IS NOT NULL',
        },
        {
            name: 'idx_store_entry_expires_at',
            columns: ['expiresAt'],
            where: '"expiresAt" IS NOT NULL',
        },
    ],
    relations: {
        dataStore: {
            type: 'many-to-one',
            target: 'data_store',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'dataStoreId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_store_entry_data_store_id',
            },
        },
    },
})

export const IMPLICIT_STORE_INDEX_PREDICATE = '"dataStoreId" IS NULL'
export const NAMED_STORE_INDEX_PREDICATE = '"dataStoreId" IS NOT NULL'

export type StoreEntrySchema = StoreEntry & {
    dataStoreId?: string | null
    expiresAt?: string | null
    dataStore?: unknown
}
