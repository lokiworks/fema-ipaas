import { Project, ProjectAccessRequest, Tenant, User } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export const ProjectAccessRequestEntity = new EntitySchema<ProjectAccessRequestSchema>({
    name: 'project_access_request',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        projectId: EntityIdSchema,
        userId: EntityIdSchema,
        reason: {
            type: String,
            nullable: true,
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
        grantedRole: {
            type: String,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_project_access_request_tenant_status',
            columns: ['tenantId', 'status'],
        },
        {
            name: 'idx_project_access_request_project_status',
            columns: ['projectId', 'status'],
        },
        {
            name: 'idx_project_access_request_user',
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
                foreignKeyConstraintName: 'fk_project_access_request_tenant_id',
            },
        },
        project: {
            type: 'many-to-one',
            target: 'project',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_project_access_request_project_id',
            },
        },
        user: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'userId',
                foreignKeyConstraintName: 'fk_project_access_request_user_id',
            },
        },
    },
})

type ProjectAccessRequestSchema = ProjectAccessRequest & {
    tenant: Tenant
    project: Project
    user: User
}
