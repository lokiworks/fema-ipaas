import {
    Execution,
    Flow,
    FlowOperationStatus,
    FlowStatus,
    FlowVersion,
    Folder,
    TriggerEvent,
    User,
    Workspace,
} from '@fema/shared'
import { EntitySchema } from 'typeorm'
import {
    ApIdSchema,
    BaseColumnSchemaPart,
} from '../../database/database-common'

export type FlowSchema = Flow & {
    versions: FlowVersion[]
    workspace: Workspace
    runs: Execution[]
    folder?: Folder
    owner?: User
    events: TriggerEvent[]
    publishedVersion?: FlowVersion
}

export const FlowEntity = new EntitySchema<FlowSchema>({
    name: 'flow',
    columns: {
        ...BaseColumnSchemaPart,
        workspaceId: {
            ...ApIdSchema,
            nullable: false,
        },
        folderId: {
            ...ApIdSchema,
            nullable: true,
        },
        status: {
            type: String,
            enum: FlowStatus,
            nullable: false,
            default: FlowStatus.DISABLED,
        },
        externalId: {
            type: String,
            nullable: false,
        },
        publishedVersionId: {
            ...ApIdSchema,
            nullable: true,
            unique: true,
        },
        metadata: {
            type: 'jsonb',
            nullable: true,
        },
        operationStatus: {
            type: String,
            nullable: false,
            default: FlowOperationStatus.NONE,
        },
        timeSavedPerRun: {
            type: Number,
            nullable: true,
        },
        ownerId: {
            type: String,
            nullable: true,
        },
        templateId: {
            type: String,
            nullable: true,
        },
        createdBy: {
            type: 'jsonb',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_flow_workspace_id',
            columns: ['workspaceId'],
            unique: false,
        },
        {
            name: 'idx_flow_owner_id',
            columns: ['ownerId'],
            unique: false,
        },
        {
            name: 'idx_flow_folder_id',
            columns: ['folderId'],
            unique: false,
        },
        {
            name: 'idx_flow_workspace_id_status',
            columns: ['workspaceId', 'status'],
            unique: false,
        },
    ],
    relations: {
        runs: {
            type: 'one-to-many',
            target: 'execution',
            inverseSide: 'flow',
        },
        owner: {
            type: 'many-to-one',
            target: 'user',
            cascade: true,
            onDelete: 'SET NULL',
            nullable: false,
            joinColumn: {
                name: 'ownerId',
                foreignKeyConstraintName: 'fk_flow_owner_id',
            },
        },
        folder: {
            type: 'many-to-one',
            target: 'folder',
            onDelete: 'SET NULL',
            nullable: true,
            joinColumn: {
                name: 'folderId',
                foreignKeyConstraintName: 'fk_flow_folder_id',
            },
        },
        events: {
            type: 'one-to-many',
            target: 'trigger_event',
            inverseSide: 'flow',
        },
        versions: {
            type: 'one-to-many',
            target: 'flow_version',
            inverseSide: 'flow',
        },
        workspace: {
            type: 'many-to-one',
            target: 'workspace',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'workspaceId',
                foreignKeyConstraintName: 'fk_flow_workspace_id',
            },
        },
        publishedVersion: {
            type: 'one-to-one',
            target: 'flow_version',
            nullable: true,
            onDelete: 'RESTRICT',
            joinColumn: {
                name: 'publishedVersionId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_flow_published_version',
            },
        },
    },
})
