import { PrivacySettings, Tenant } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export type PrivacySettingsSchema = PrivacySettings & {
    tenant?: Tenant
}

export const PrivacySettingsEntity = new EntitySchema<PrivacySettingsSchema>({
    name: 'privacy_settings',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        logRetentionDays: {
            type: Number,
        },
        payloadLevel: {
            type: String,
        },
        rawPayloadRetentionDays: {
            type: Number,
        },
        maskRules: {
            type: 'jsonb',
        },
        rawViewRoles: {
            type: String,
            array: true,
            nullable: false,
        },
        requireRawViewReason: {
            type: Boolean,
            default: true,
        },
    },
    indices: [
        {
            name: 'idx_privacy_settings_tenant_id',
            columns: ['tenantId'],
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
                foreignKeyConstraintName: 'fk_privacy_settings_tenant_id',
            },
        },
    },
})
