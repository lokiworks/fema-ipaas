import { BaseModelSchema, formErrors, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { STORE_KEY_MAX_LENGTH } from '../../core/store-entry/store-entry'

export const DATA_STORE_KEY_PREFIX = 'datastore:'
export const DATA_STORE_NAME_MAX_LENGTH = 50
export const DATA_STORE_DESCRIPTION_MAX_LENGTH = 200
export const DATA_STORE_MIN_TTL_DAYS = 1
export const DATA_STORE_MAX_TTL_DAYS = 365
export const DATA_STORE_DEFAULT_TTL_DAYS = 30
export const DATA_STORE_VALUE_MAX_LENGTH = 10000
export const DATA_STORE_RECORDS_DEFAULT_LIMIT = 100
export const DATA_STORE_RECORDS_MAX_LIMIT = 500

export enum DataStoreRecordWriteMode {
    CREATE = 'CREATE',
    UPDATE = 'UPDATE',
}

export const DataStore = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    name: z.string(),
    description: Nullable(z.string()),
    ttlDays: z.number(),
    ownerId: Nullable(z.string()),
})
export type DataStore = z.infer<typeof DataStore>

export const DataStoreSummary = DataStore.extend({
    recordCount: z.number(),
    ownerName: Nullable(z.string()),
})
export type DataStoreSummary = z.infer<typeof DataStoreSummary>

export const DataStoreRecord = z.object({
    key: z.string(),
    value: z.unknown(),
    updated: z.string(),
    expiresAt: Nullable(z.string()),
})
export type DataStoreRecord = z.infer<typeof DataStoreRecord>

export const DataStoreRecordsPage = z.object({
    data: z.array(DataStoreRecord),
    total: z.number(),
})
export type DataStoreRecordsPage = z.infer<typeof DataStoreRecordsPage>

const DataStoreFields = {
    name: z.string().trim()
        .min(1, formErrors.required)
        .max(DATA_STORE_NAME_MAX_LENGTH, 'dataStoreNameTooLong')
        .refine((name) => !name.includes('/'), 'dataStoreNameNoSlash'),
    description: z.string().trim().max(DATA_STORE_DESCRIPTION_MAX_LENGTH, 'dataStoreDescriptionTooLong'),
    ttlDays: z.number({ error: 'dataStoreTtlOutOfRange' })
        .int('dataStoreTtlOutOfRange')
        .min(DATA_STORE_MIN_TTL_DAYS, 'dataStoreTtlOutOfRange')
        .max(DATA_STORE_MAX_TTL_DAYS, 'dataStoreTtlOutOfRange'),
}

export const CreateDataStoreRequestBody = z.object({
    projectId: z.string(),
    ...DataStoreFields,
})
export type CreateDataStoreRequestBody = z.infer<typeof CreateDataStoreRequestBody>

export const UpdateDataStoreRequestBody = z.object(DataStoreFields)
export type UpdateDataStoreRequestBody = z.infer<typeof UpdateDataStoreRequestBody>

export const ListDataStoresRequestQuery = z.object({
    projectId: z.string(),
})
export type ListDataStoresRequestQuery = z.infer<typeof ListDataStoresRequestQuery>

export const ListDataStoreRecordsRequestQuery = z.object({
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(DATA_STORE_RECORDS_MAX_LIMIT).optional(),
})
export type ListDataStoreRecordsRequestQuery = z.infer<typeof ListDataStoreRecordsRequestQuery>

export const UpsertDataStoreRecordRequestBody = z.object({
    mode: z.enum(DataStoreRecordWriteMode),
    key: z.string().trim()
        .min(1, formErrors.required)
        .max(STORE_KEY_MAX_LENGTH, 'dataStoreKeyTooLong'),
    value: z.string().max(DATA_STORE_VALUE_MAX_LENGTH, 'dataStoreValueTooLong'),
})
export type UpsertDataStoreRecordRequestBody = z.infer<typeof UpsertDataStoreRecordRequestBody>

export const DeleteDataStoreRecordRequestQuery = z.object({
    key: z.string().min(1),
})
export type DeleteDataStoreRecordRequestQuery = z.infer<typeof DeleteDataStoreRecordRequestQuery>
