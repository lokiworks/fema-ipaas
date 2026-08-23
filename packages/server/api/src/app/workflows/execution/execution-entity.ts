import {
    Execution,
    File,
    User,
    Workflow,
    WorkflowVersion,
    Workspace,
} from '@fema/shared'
import { EntitySchema } from 'typeorm'
import {
    ApIdSchema,
    BaseColumnSchemaPart,
} from '../../database/database-common'

type ExecutionSchema = Execution & {
    workspace: Workspace
    workflow: Workflow
    workflowVersion: WorkflowVersion
    logsFile: File
    triggeredByUser?: User
    /** @deprecated kept for backwards compatibility, use waitpoint table instead, remove in 0.83.0 */
    pauseMetadata?: unknown
}

export const ExecutionEntity = new EntitySchema<ExecutionSchema>({
    name: 'execution',
    columns: {
        ...BaseColumnSchemaPart,
        workspaceId: ApIdSchema,
        workflowId: ApIdSchema,
        workflowVersionId: ApIdSchema,
        environment: {
            type: String,
            nullable: true,
        },
        logsFileId: {
            ...ApIdSchema,
            nullable: true,
        },
        parentRunId: {
            ...ApIdSchema,
            nullable: true,
        },
        failParentOnFailure: {
            type: Boolean,
            nullable: false,
            default: true,
        },
        status: {
            type: String,
        },
        tags: {
            type: String,
            array: true,
            nullable: true,
        },
        startTime: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        triggeredBy: {
            type: String,
            nullable: true,
        },
        finishTime: {
            nullable: true,
            type: 'timestamp with time zone',
        },
        timeline: {
            type: 'jsonb',
            nullable: true,
        },
        failedStep: {
            type: 'jsonb',
            nullable: true,
        },
        archivedAt: {
            type: String,
            nullable: true,
            default: null,
        },
        stepNameToTest: {
            type: String,
            nullable: true,
        },
        stepsCount: {
            type: Number,
            nullable: false,
            default: 0,
        },
        // @deprecated — kept for backwards compatibility, use waitpoint table instead
        pauseMetadata: {
            type: 'jsonb',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_run_workspace_id_environment_workflow_id_status_created_archived_',
            columns: ['workspaceId', 'environment', 'workflowId', 'status', 'created', 'archivedAt'],
        },
        {
            name: 'idx_run_workspace_id_environment_status_created_archived_at',
            columns: ['workspaceId', 'environment', 'status', 'created', 'archivedAt'],
        },
        {
            name: 'idx_run_workspace_id_environment_created_archived_at',
            columns: ['workspaceId', 'environment', 'created', 'archivedAt'],
        },
        {
            name: 'idx_run_workspace_id_environment_created_status_archived_at',
            columns: ['workspaceId', 'environment', 'created', 'archivedAt', 'status'],
        },
        {
            name: 'idx_run_workspace_id_environment_workflow_id_created_archived_at',
            columns: ['workspaceId', 'environment', 'workflowId', 'created', 'archivedAt'],
        },
        {
            name: 'idx_run_workflow_id',
            columns: ['workflowId'],
        },
        {
            name: 'idx_run_logs_file_id',
            columns: ['logsFileId'],
        },
        {
            name: 'idx_run_parent_run_id',
            columns: ['parentRunId'],
        },
        {
            name: 'idx_run_workflow_version_id',
            columns: ['workflowVersionId'],
        },
        {
            name: 'idx_run_triggered_by',
            columns: ['triggeredBy'],
        },
    ],
    relations: {
        triggeredByUser: {
            type: 'many-to-one',
            target: 'user',
            cascade: true,
            onDelete: 'SET NULL',
            joinColumn: {
                name: 'triggeredBy',
                foreignKeyConstraintName: 'fk_execution_triggered_by_user_id',
            },
        },
        workspace: {
            type: 'many-to-one',
            target: 'workspace',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'workspaceId',
                foreignKeyConstraintName: 'fk_execution_workspace_id',
            },
        },
        workflow: {
            type: 'many-to-one',
            target: 'workflow',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'workflowId',
                foreignKeyConstraintName: 'fk_execution_workflow_id',
            },
        },
        workflowVersion: {
            type: 'many-to-one',
            target: 'workflow_version',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'workflowVersionId',
                foreignKeyConstraintName: 'fk_execution_workflow_version_id',
            },
        },
        logsFile: {
            type: 'many-to-one',
            target: 'file',
            cascade: true,
            onDelete: 'SET NULL',
            joinColumn: {
                name: 'logsFileId',
                foreignKeyConstraintName: 'fk_execution_logs_file_id',
            },
        },
    },
})