import { PauseType, Workspace } from '@fema/shared'
import { EntitySchema } from 'typeorm'
import { ApIdSchema, BaseColumnSchemaPart } from '../../../database/database-common'
import { Waitpoint, WaitpointStatus, WaitpointVersionEnum } from './waitpoint-types'

type WaitpointSchema = Waitpoint & {
    workspace: Workspace
}

export const WaitpointEntity = new EntitySchema<WaitpointSchema>({
    name: 'waitpoint',
    columns: {
        ...BaseColumnSchemaPart,
        executionId: {
            ...ApIdSchema,
            nullable: false,
        },
        workspaceId: {
            ...ApIdSchema,
            nullable: false,
        },
        type: {
            type: String,
            nullable: false,
            enum: PauseType,
        },
        status: {
            type: String,
            nullable: false,
            enum: WaitpointStatus,
        },
        resumeDateTime: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        responseToSend: {
            type: 'jsonb',
            nullable: true,
        },
        workerHandlerId: {
            type: String,
            nullable: true,
        },
        httpRequestId: {
            type: String,
            nullable: true,
        },
        version: {
            type: String,
            nullable: false,
            default: 'V0',
            enum: WaitpointVersionEnum,
        },
        stepName: {
            type: String,
            nullable: false,
            default: '',
        },
        resumePayload: {
            type: 'jsonb',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_waitpoint_execution_id_step_name',
            columns: ['executionId', 'stepName'],
            unique: true,
        },
        {
            name: 'idx_waitpoint_workspace_id',
            columns: ['workspaceId'],
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
                foreignKeyConstraintName: 'fk_waitpoint_workspace_id',
            },
        },
    },
})
