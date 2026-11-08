import { Tenant } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export const TenantUsageSnapshotEntity = new EntitySchema<TenantUsageSnapshotSchema>({
    name: 'tenant_usage_snapshot',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        date: {
            type: 'date',
            nullable: false,
        },
        activeWorkflows: {
            type: Number,
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_tenant_usage_snapshot_tenant_date',
            columns: ['tenantId', 'date'],
            unique: true,
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                foreignKeyConstraintName: 'fk_tenant_usage_snapshot_tenant_id',
            },
        },
    },
})

export type TenantUsageSnapshotSchema = {
    id: string
    created: string
    updated: string
    tenantId: string
    date: string
    activeWorkflows: number
    tenant: Tenant
}
