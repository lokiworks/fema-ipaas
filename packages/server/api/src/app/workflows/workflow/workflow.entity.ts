import {
    Execution,
    Folder,
    TriggerEvent,
    User,
    Workflow,
    WorkflowOperationStatus,
    WorkflowStatus,
    WorkflowVersion,
    Workspace,
} from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    ApIdSchema,
    BaseColumnSchemaPart,
} from '../../database/database-common'

export type WorkflowSchema = Workflow & {
    versions: WorkflowVersion[]
    workspace: Workspace
    runs: Execution[]
    folder?: Folder
    owner?: User
    events: TriggerEvent[]
    publishedVersion?: WorkflowVersion
}

export const WorkflowEntity = new EntitySchema<WorkflowSchema>({
    name: 'workflow',
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
            enum: WorkflowStatus,
            nullable: false,
            default: WorkflowStatus.DISABLED,
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
            default: WorkflowOperationStatus.NONE,
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
            name: 'idx_workflow_workspace_id',
            columns: ['workspaceId'],
            unique: false,
        },
        {
            name: 'idx_workflow_owner_id',
            columns: ['ownerId'],
            unique: false,
        },
        {
            name: 'idx_workflow_folder_id',
            columns: ['folderId'],
            unique: false,
        },
        {
            name: 'idx_workflow_workspace_id_status',
            columns: ['workspaceId', 'status'],
            unique: false,
        },
    ],
    relations: {
        runs: {
            type: 'one-to-many',
            target: 'execution',
            inverseSide: 'workflow',
        },
        owner: {
            type: 'many-to-one',
            target: 'user',
            cascade: true,
            onDelete: 'SET NULL',
            nullable: false,
            joinColumn: {
                name: 'ownerId',
                foreignKeyConstraintName: 'fk_workflow_owner_id',
            },
        },
        folder: {
            type: 'many-to-one',
            target: 'folder',
            onDelete: 'SET NULL',
            nullable: true,
            joinColumn: {
                name: 'folderId',
                foreignKeyConstraintName: 'fk_workflow_folder_id',
            },
        },
        events: {
            type: 'one-to-many',
            target: 'trigger_event',
            inverseSide: 'workflow',
        },
        versions: {
            type: 'one-to-many',
            target: 'workflow_version',
            inverseSide: 'workflow',
        },
        workspace: {
            type: 'many-to-one',
            target: 'workspace',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'workspaceId',
                foreignKeyConstraintName: 'fk_workflow_workspace_id',
            },
        },
        publishedVersion: {
            type: 'one-to-one',
            target: 'workflow_version',
            nullable: true,
            onDelete: 'RESTRICT',
            joinColumn: {
                name: 'publishedVersionId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_workflow_published_version',
            },
        },
    },
})
