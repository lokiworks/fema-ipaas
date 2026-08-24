import { File, TriggerEvent, Workflow, Workspace } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import {
    BaseColumnSchemaPart,
    EntityIdSchema,
} from '../../database/database-common'

type TriggerEventSchema = {
    workflow: Workflow
    workspace: Workspace
    file: File
} & TriggerEvent

export const TriggerEventEntity = new EntitySchema<TriggerEventSchema>({
    name: 'trigger_event',
    columns: {
        ...BaseColumnSchemaPart,
        workflowId: EntityIdSchema,
        workspaceId: EntityIdSchema,
        sourceName: {
            type: String,
        },
        fileId: {
            type: String,
        },
    },
    indices: [
        {
            name: 'idx_trigger_event_workspace_id_workflow_id',
            columns: ['workspaceId', 'workflowId'],
            unique: false,
        },
        {
            name: 'idx_trigger_event_workflow_id',
            columns: ['workflowId'],
            unique: false,
        },
        {
            name: 'idx_trigger_event_file_id',
            columns: ['fileId'],
            unique: true,
        },
    ],
    relations: {
        workspace: {
            type: 'many-to-one',
            target: 'workspace',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'workspaceId',
                foreignKeyConstraintName: 'fk_trigger_event_workspace_id',
            },
        },
        file: {
            type: 'many-to-one',
            target: 'file',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'fileId',
                foreignKeyConstraintName: 'fk_trigger_event_file_id',
            },
        },
        workflow: {
            type: 'many-to-one',
            target: 'workflow',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'workflowId',
                foreignKeyConstraintName: 'fk_trigger_event_workflow_id',
            },
        },
    },
})
