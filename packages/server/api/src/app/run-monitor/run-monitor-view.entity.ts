import { RunMonitorView, Tenant, User } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export const RunMonitorViewEntity = new EntitySchema<RunMonitorViewSchema>({
    name: 'run_monitor_view',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        userId: EntityIdSchema,
        name: {
            type: String,
            nullable: false,
        },
        config: {
            type: 'jsonb',
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_run_monitor_view_user_id_name',
            columns: ['userId', 'name'],
            unique: true,
        },
        {
            name: 'idx_run_monitor_view_tenant_id_user_id',
            columns: ['tenantId', 'userId'],
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                foreignKeyConstraintName: 'fk_run_monitor_view_tenant_id',
            },
        },
        user: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'userId',
                foreignKeyConstraintName: 'fk_run_monitor_view_user_id',
            },
        },
    },
})

type RunMonitorViewSchema = RunMonitorView & {
    tenant: Tenant
    user: User
}
