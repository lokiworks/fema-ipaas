import { User, Workflow, WorkflowVersion } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    ApIdSchema,
    BaseColumnSchemaPart,
} from '../../database/database-common'

export type WorkflowVersionSchema = {
    workflow: Workflow
    updatedByUser: User
} & WorkflowVersion

export const WorkflowVersionEntity = new EntitySchema<WorkflowVersionSchema>({
    name: 'workflow_version',
    columns: {
        ...BaseColumnSchemaPart,
        workflowId: ApIdSchema,
        displayName: {
            type: String,
        },
        schemaVersion: {
            type: String,
            nullable: true,
        },
        trigger: {
            type: 'jsonb',
            nullable: true,
        },
        connectionIds: {
            type: String,
            array: true,
            nullable: false,
        },
        agentIds: {
            type: String,
            array: true,
            nullable: false,
        },
        updatedBy: {
            type: String,
            nullable: true,
        },
        valid: {
            type: Boolean,
        },
        state: {
            type: String,
        },
        backupFiles: {
            type: 'jsonb',
            nullable: true,
        },
        notes: {
            type: 'jsonb',
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_workflow_version_workflow_id_created_desc',
            columns: ['workflowId', 'created'],
            unique: false,
        },
        {
            name: 'idx_workflow_version_schema_version',
            columns: ['schemaVersion'],
            unique: false,
        },
        {
            name: 'idx_workflow_version_updated_by',
            columns: ['updatedBy'],
        },
        {
            name: 'idx_workflow_version_connection_ids_gin',
            columns: ['connectionIds'],
            synchronize: false,
        },
    ],
    relations: {
        updatedByUser: {
            type: 'many-to-one',
            target: 'user',
            cascade: true,
            onDelete: 'SET NULL',
            joinColumn: {
                name: 'updatedBy',
                foreignKeyConstraintName: 'fk_updated_by_user_workflow',
            },
        },
        workflow: {
            type: 'many-to-one',
            target: 'workflow',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'workflowId',
                foreignKeyConstraintName: 'fk_workflow_version_workflow',
            },
        },
    },
})
