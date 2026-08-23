import { TriggerSource, Workflow, Workspace } from '@fema/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../database/database-common'

export type TriggerSourceSchema = TriggerSource & {
    workflow: Workflow
    workspace: Workspace
}

export const TriggerSourceEntity = new EntitySchema<TriggerSourceSchema>({
    name: 'trigger_source',
    columns: {
        ...BaseColumnSchemaPart,
        deleted: {
            type: 'timestamp with time zone',
            deleteDate: true,
            nullable: true,
        },
        workflowId: {
            type: String,
            nullable: false,
        },
        workflowVersionId: {
            type: String,
            nullable: false,
        },
        triggerName: {
            type: String,
            nullable: false,
        },
        workspaceId: {
            type: String,
            nullable: false,
        },
        type: {
            type: String,
            nullable: false,
        },
        schedule: {
            type: 'jsonb',
            nullable: true,
        },
        connectorName: {
            type: String,
            nullable: false,
        },
        connectorVersion: {
            type: String,
            nullable: false,
        },
        simulate: {
            type: Boolean,
            nullable: false,
        },
    },
    indices: [
        {
            columns: ['workspaceId', 'workflowId', 'simulate'],
            name: 'idx_trigger_workspace_id_workflow_id_simulate',
            where: 'deleted IS NULL',
            unique: true,
        },
        {
            columns: ['workflowId', 'simulate'],
            name: 'idx_trigger_workflow_id_simulate',
            where: 'deleted IS NULL',
            unique: true,
        },
        {
            columns: ['workflowId'],
            name: 'idx_trigger_workflow_id',
            unique: false,
        },
        {
            columns: ['workspaceId'],
            name: 'idx_trigger_workspace_id',
            unique: false,
        },
        {
            columns: ['workflowVersionId'],
            name: 'idx_trigger_workflow_version_id',
            where: 'deleted IS NULL',
            unique: false,
        },
    ],
    relations: {
        workflow: {
            type: 'many-to-one',
            target: 'workflow',
            inverseSide: 'triggers',
            cascade: true,
            onDelete: 'CASCADE',
        },
        workspace: {
            type: 'many-to-one',
            target: 'workspace',
            inverseSide: 'triggers',
            cascade: true,
            onDelete: 'CASCADE',
        },
    },
})
