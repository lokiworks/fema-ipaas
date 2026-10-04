import { OptionalServiceKind, Tenant } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'
import { EncryptedObject } from '../helper/encryption'

export type ServiceSettingSchema = {
    id: string
    created: string
    updated: string
    tenantId: string
    kind: OptionalServiceKind
    values: Record<string, string | number>
    secrets: EncryptedObject | null
    updatedBy: string | null
    tenant?: Tenant
}

export const ServiceSettingEntity = new EntitySchema<ServiceSettingSchema>({
    name: 'service_setting',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        kind: {
            type: String,
        },
        values: {
            type: 'jsonb',
        },
        secrets: {
            type: 'jsonb',
            nullable: true,
        },
        updatedBy: {
            ...EntityIdSchema,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_service_setting_tenant_id_kind',
            columns: ['tenantId', 'kind'],
            unique: true,
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
                foreignKeyConstraintName: 'fk_service_setting_tenant_id',
            },
        },
    },
})
