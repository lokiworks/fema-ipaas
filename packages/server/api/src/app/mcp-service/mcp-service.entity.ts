import { McpService, Project } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export type McpServiceSchema = McpService & {
    tokenHash: string
    project?: Project
}

export const McpServiceEntity = new EntitySchema<McpServiceSchema>({
    name: 'mcp_service',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: EntityIdSchema,
        name: {
            type: String,
        },
        description: {
            type: String,
        },
        enabled: {
            type: Boolean,
        },
        tools: {
            type: 'jsonb',
        },
        tokenHash: {
            type: String,
        },
        tokenHint: {
            type: String,
        },
        lastUsedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_mcp_service_project_id',
            columns: ['projectId'],
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
                foreignKeyConstraintName: 'fk_mcp_service_project_id',
            },
        },
    },
})
