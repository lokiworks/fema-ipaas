import { DataErasureRequest, Tenant } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'
import { EncryptedObject } from '../helper/encryption'

export type DataErasureRequestSchema = DataErasureRequest & {
    valueEncrypted: EncryptedObject | null
    matchedExecutionIds: string[]
    tenant?: Tenant
}

export const DataErasureRequestEntity = new EntitySchema<DataErasureRequestSchema>({
    name: 'data_erasure_request',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        kind: {
            type: String,
        },
        valueHint: {
            type: String,
        },
        subjectHint: {
            type: String,
            nullable: true,
        },
        reason: {
            type: String,
        },
        requestedById: EntityIdSchema,
        status: {
            type: String,
        },
        scannedRuns: {
            type: Number,
        },
        matchedRuns: {
            type: Number,
        },
        erasedRuns: {
            type: Number,
        },
        matchedWorkflows: {
            type: 'jsonb',
        },
        matchedExecutionIds: {
            type: String,
            array: true,
            nullable: false,
        },
        firstMatchAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        lastMatchAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        finishedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        error: {
            type: String,
            nullable: true,
        },
        valueEncrypted: {
            type: 'jsonb',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_data_erasure_request_tenant_id_created',
            columns: ['tenantId', 'created'],
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_data_erasure_request_tenant_id',
            },
        },
    },
})
