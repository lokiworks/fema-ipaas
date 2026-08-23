import { File, Flow, TriggerEvent, Workspace } from '@fema/shared'
import { EntitySchema } from 'typeorm'
import {
    ApIdSchema,
    BaseColumnSchemaPart,
} from '../../database/database-common'

type TriggerEventSchema = {
    flow: Flow
    workspace: Workspace
    file: File
} & TriggerEvent

export const TriggerEventEntity = new EntitySchema<TriggerEventSchema>({
    name: 'trigger_event',
    columns: {
        ...BaseColumnSchemaPart,
        flowId: ApIdSchema,
        workspaceId: ApIdSchema,
        sourceName: {
            type: String,
        },
        fileId: {
            type: String,
        },
    },
    indices: [
        {
            name: 'idx_trigger_event_workspace_id_flow_id',
            columns: ['workspaceId', 'flowId'],
            unique: false,
        },
        {
            name: 'idx_trigger_event_flow_id',
            columns: ['flowId'],
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
        flow: {
            type: 'many-to-one',
            target: 'flow',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'flowId',
                foreignKeyConstraintName: 'fk_trigger_event_flow_id',
            },
        },
    },
})
