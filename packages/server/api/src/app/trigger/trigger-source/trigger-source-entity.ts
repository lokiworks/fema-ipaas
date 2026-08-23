import { Flow, TriggerSource, Workspace } from '@fema/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../database/database-common'

export type TriggerSourceSchema = TriggerSource & {
    flow: Flow
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
        flowId: {
            type: String,
            nullable: false,
        },
        flowVersionId: {
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
            columns: ['workspaceId', 'flowId', 'simulate'],
            name: 'idx_trigger_workspace_id_flow_id_simulate',
            where: 'deleted IS NULL',
            unique: true,
        },
        {
            columns: ['flowId', 'simulate'],
            name: 'idx_trigger_flow_id_simulate',
            where: 'deleted IS NULL',
            unique: true,
        },
        {
            columns: ['flowId'],
            name: 'idx_trigger_flow_id',
            unique: false,
        },
        {
            columns: ['workspaceId'],
            name: 'idx_trigger_workspace_id',
            unique: false,
        },
        {
            columns: ['flowVersionId'],
            name: 'idx_trigger_flow_version_id',
            where: 'deleted IS NULL',
            unique: false,
        },
    ],
    relations: {
        flow: {
            type: 'many-to-one',
            target: 'flow',
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
