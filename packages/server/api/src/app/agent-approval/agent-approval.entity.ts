import { AgentApproval, Project } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export type AgentApprovalSchema = AgentApproval & {
    waitpointId: string
    project?: Project
}

export const AgentApprovalEntity = new EntitySchema<AgentApprovalSchema>({
    name: 'agent_approval',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: EntityIdSchema,
        workflowId: EntityIdSchema,
        executionId: EntityIdSchema,
        stepName: {
            type: String,
        },
        waitpointId: EntityIdSchema,
        tool: {
            type: String,
        },
        arguments: {
            type: 'jsonb',
        },
        message: {
            type: String,
        },
        status: {
            type: String,
        },
        approverIds: {
            type: String,
            array: true,
            nullable: false,
        },
        decidedById: {
            ...EntityIdSchema,
            nullable: true,
        },
        decidedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        comment: {
            type: String,
            nullable: true,
        },
        expiresAt: {
            type: 'timestamp with time zone',
        },
    },
    indices: [
        {
            name: 'idx_agent_approval_project_id_status',
            columns: ['projectId', 'status'],
        },
        {
            name: 'idx_agent_approval_execution_id',
            columns: ['executionId'],
        },
        {
            name: 'idx_agent_approval_status_expires_at',
            columns: ['status', 'expiresAt'],
        },
    ],
    relations: {
        project: {
            type: 'many-to-one',
            target: 'project',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_agent_approval_project_id',
            },
        },
    },
})
