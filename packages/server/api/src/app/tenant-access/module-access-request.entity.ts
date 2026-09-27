import { ModuleAccessRequest, Tenant, User } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export const ModuleAccessRequestEntity = new EntitySchema<ModuleAccessRequestSchema>({
    name: 'module_access_request',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        userId: EntityIdSchema,
        module: {
            type: String,
            nullable: false,
        },
        reason: {
            type: String,
            nullable: false,
        },
        status: {
            type: String,
            nullable: false,
        },
        decidedBy: {
            ...EntityIdSchema,
            nullable: true,
        },
        decidedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_module_access_request_tenant_status',
            columns: ['tenantId', 'status'],
        },
        {
            name: 'idx_module_access_request_user',
            columns: ['userId'],
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                foreignKeyConstraintName: 'fk_module_access_request_tenant_id',
            },
        },
        user: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'userId',
                foreignKeyConstraintName: 'fk_module_access_request_user_id',
            },
        },
    },
})

type ModuleAccessRequestSchema = ModuleAccessRequest & {
    tenant: Tenant
    user: User
}
