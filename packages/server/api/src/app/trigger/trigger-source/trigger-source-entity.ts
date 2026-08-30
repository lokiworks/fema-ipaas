import { Project, TriggerSource, Workflow } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../database/database-common'

export type TriggerSourceSchema = TriggerSource & {
    workflow: Workflow
    project: Project
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
        projectId: {
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
            columns: ['projectId', 'workflowId', 'simulate'],
            name: 'idx_trigger_project_id_workflow_id_simulate',
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
            columns: ['projectId'],
            name: 'idx_trigger_project_id',
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
        project: {
            type: 'many-to-one',
            target: 'project',
            inverseSide: 'triggers',
            cascade: true,
            onDelete: 'CASCADE',
        },
    },
})
