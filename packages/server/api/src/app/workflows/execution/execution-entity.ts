import {
    Execution,
    File,
    Project,
    User,
    Workflow,
    WorkflowVersion,
} from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
    EntityIdSchema,
} from '../../database/database-common'

type ExecutionSchema = Execution & {
    project: Project
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
        projectId: EntityIdSchema,
        workflowId: EntityIdSchema,
        workflowVersionId: EntityIdSchema,
        environment: {
            type: String,
            nullable: true,
        },
        logsFileId: {
            ...EntityIdSchema,
            nullable: true,
        },
        parentRunId: {
            ...EntityIdSchema,
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
            name: 'idx_execution_ws_env_wf_status_created_archived',
            columns: ['projectId', 'environment', 'workflowId', 'status', 'created', 'archivedAt'],
        },
        {
            name: 'idx_run_project_id_environment_status_created_archived_at',
            columns: ['projectId', 'environment', 'status', 'created', 'archivedAt'],
        },
        {
            name: 'idx_run_project_id_environment_created_archived_at',
            columns: ['projectId', 'environment', 'created', 'archivedAt'],
        },
        {
            name: 'idx_run_project_id_environment_created_status_archived_at',
            columns: ['projectId', 'environment', 'created', 'archivedAt', 'status'],
        },
        {
            name: 'idx_execution_ws_env_wf_created_archived',
            columns: ['projectId', 'environment', 'workflowId', 'created', 'archivedAt'],
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
        project: {
            type: 'many-to-one',
            target: 'project',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_execution_project_id',
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