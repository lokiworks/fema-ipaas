import {
    Connection,
    File,
    Folder,
    Project,
    Tenant,
    TriggerEvent,
    User,
    Workflow,
} from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
    EntityIdSchema,
} from '../database/database-common'

type ProjectSchema = Project & {
    owner: User
    workflows: Workflow[]
    files: File[]
    folders: Folder[]
    events: TriggerEvent[]
    connections: Connection[]
    tenant: Tenant
}

export const ProjectEntity = new EntitySchema<ProjectSchema>({
    name: 'project',
    columns: {
        ...BaseColumnSchemaPart,
        deleted: {
            type: 'timestamp with time zone',
            deleteDate: true,
            nullable: true,
        },
        ownerId: EntityIdSchema,
        displayName: {
            type: String,
        },
        type: {
            type: String,
            nullable: false,
        },
        tenantId: {
            ...EntityIdSchema,
        },
        externalId: {
            type: String,
            nullable: true,
        },
        maxConcurrentJobs: {
            type: Number,
            nullable: true,
        },
        icon: {
            type: 'jsonb',
            nullable: false,
        },
        releasesEnabled: {
            type: Boolean,
            nullable: false,
            default: false,
        },
        notifyWorkflowOwnerOnFailure: {
            type: Boolean,
            nullable: false,
            default: false,
        },
        metadata: {
            type: 'jsonb',
            nullable: true,
        },
        workerGroupId: {
            type: String,
            nullable: true,
        },
        executionDataRetentionDays: {
            type: Number,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_project_owner_id',
            columns: ['ownerId'],
            unique: false,
        },
        {
            name: 'idx_project_tenant_id_external_id',
            columns: ['tenantId', 'externalId'],
            where: 'deleted IS NULL',
            unique: true,
        },
        {
            name: 'idx_project_tenant_id',
            columns: ['tenantId'],
            unique: false,
        },
        {
            name: 'idx_project_worker_group',
            columns: ['workerGroupId'],
            unique: false,
        },
        {
            name: 'idx_project_execution_data_retention_days',
            columns: ['executionDataRetentionDays'],
            where: '"executionDataRetentionDays" IS NOT NULL',
            unique: false,
        },
    ],
    relations: {
        owner: {
            type: 'many-to-one',
            target: 'user',
            joinColumn: {
                name: 'ownerId',
                foreignKeyConstraintName: 'fk_project_owner_id',
            },
        },
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            cascade: true,
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'tenantId',
                foreignKeyConstraintName: 'fk_project_tenant_id',
            },
        },
        folders: {
            type: 'one-to-many',
            target: 'folder',
            inverseSide: 'project',
        },
        connections: {
            type: 'one-to-many',
            target: 'connection',
            inverseSide: 'project',
        },
        events: {
            type: 'one-to-many',
            target: 'trigger_event',
            inverseSide: 'project',
        },
        files: {
            type: 'one-to-many',
            target: 'file',
            inverseSide: 'project',
        },
        workflows: {
            type: 'one-to-many',
            target: 'workflow',
            inverseSide: 'project',
        },
    },
})
