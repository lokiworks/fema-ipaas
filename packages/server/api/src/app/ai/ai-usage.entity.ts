import { AiUsageRecord, Project } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export type AiUsageSchema = AiUsageRecord & {
    project?: Project
}

export const AiUsageEntity = new EntitySchema<AiUsageSchema>({
    name: 'ai_usage',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: EntityIdSchema,
        workflowId: {
            ...EntityIdSchema,
            nullable: true,
        },
        executionId: {
            ...EntityIdSchema,
            nullable: true,
        },
        userId: {
            ...EntityIdSchema,
            nullable: true,
        },
        feature: {
            type: String,
        },
        provider: {
            type: String,
        },
        model: {
            type: String,
        },
        inputTokens: {
            type: Number,
        },
        outputTokens: {
            type: Number,
        },
    },
    indices: [
        {
            name: 'idx_ai_usage_project_id_created',
            columns: ['projectId', 'created'],
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
                foreignKeyConstraintName: 'fk_ai_usage_project_id',
            },
        },
    },
})
