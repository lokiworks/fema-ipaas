import {
    Connection,
    File,
    Flow,
    Folder,
    Platform,
    TriggerEvent,
    User,
    Workspace,
} from '@fema/shared'
import { EntitySchema } from 'typeorm'
import {
    ApIdSchema,
    BaseColumnSchemaPart,
} from '../database/database-common'

type WorkspaceSchema = Workspace & {
    owner: User
    flows: Flow[]
    files: File[]
    folders: Folder[]
    events: TriggerEvent[]
    connections: Connection[]
    platform: Platform
}

export const WorkspaceEntity = new EntitySchema<WorkspaceSchema>({
    name: 'workspace',
    columns: {
        ...BaseColumnSchemaPart,
        deleted: {
            type: 'timestamp with time zone',
            deleteDate: true,
            nullable: true,
        },
        ownerId: ApIdSchema,
        displayName: {
            type: String,
        },
        type: {
            type: String,
            nullable: false,
        },
        platformId: {
            ...ApIdSchema,
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
        notifyFlowOwnerOnFailure: {
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
            name: 'idx_workspace_owner_id',
            columns: ['ownerId'],
            unique: false,
        },
        {
            name: 'idx_workspace_platform_id_external_id',
            columns: ['platformId', 'externalId'],
            where: 'deleted IS NULL',
            unique: true,
        },
        {
            name: 'idx_workspace_platform_id',
            columns: ['platformId'],
            unique: false,
        },
        {
            name: 'idx_workspace_worker_group',
            columns: ['workerGroupId'],
            unique: false,
        },
        {
            name: 'idx_workspace_execution_data_retention_days',
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
                foreignKeyConstraintName: 'fk_workspace_owner_id',
            },
        },
        platform: {
            type: 'many-to-one',
            target: 'platform',
            cascade: true,
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'platformId',
                foreignKeyConstraintName: 'fk_workspace_platform_id',
            },
        },
        folders: {
            type: 'one-to-many',
            target: 'folder',
            inverseSide: 'workspace',
        },
        connections: {
            type: 'one-to-many',
            target: 'connection',
            inverseSide: 'workspace',
        },
        events: {
            type: 'one-to-many',
            target: 'trigger_event',
            inverseSide: 'workspace',
        },
        files: {
            type: 'one-to-many',
            target: 'file',
            inverseSide: 'workspace',
        },
        flows: {
            type: 'one-to-many',
            target: 'flow',
            inverseSide: 'workspace',
        },
    },
})
