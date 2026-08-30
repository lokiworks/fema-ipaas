import {
    Execution,
    Folder,
    Project,
    TriggerEvent,
    User,
    Workflow,
    WorkflowOperationStatus,
    WorkflowStatus,
    WorkflowVersion,
} from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
    EntityIdSchema,
} from '../../database/database-common'

export type WorkflowSchema = Workflow & {
    versions: WorkflowVersion[]
    project: Project
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
        projectId: {
            ...EntityIdSchema,
            nullable: false,
        },
        folderId: {
            ...EntityIdSchema,
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
            ...EntityIdSchema,
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
            name: 'idx_workflow_project_id',
            columns: ['projectId'],
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
            name: 'idx_workflow_project_id_status',
            columns: ['projectId', 'status'],
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
        project: {
            type: 'many-to-one',
            target: 'project',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_workflow_project_id',
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
