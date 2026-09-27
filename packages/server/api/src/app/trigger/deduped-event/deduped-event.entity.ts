import { DedupedEvent, Project, Workflow } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../../database/database-common'

export type DedupedEventSchema = DedupedEvent & {
    project?: Project
    workflow?: Workflow
}

export const DedupedEventEntity = new EntitySchema<DedupedEventSchema>({
    name: 'deduped_event',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: EntityIdSchema,
        workflowId: EntityIdSchema,
        workflowVersionId: EntityIdSchema,
        keyHash: {
            type: String,
        },
        keyPreview: {
            type: String,
        },
        keyPath: {
            type: String,
        },
        windowSeconds: {
            type: Number,
        },
        firstExecutionId: {
            ...EntityIdSchema,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_deduped_event_project_id_created',
            columns: ['projectId', 'created'],
        },
        {
            name: 'idx_deduped_event_workflow_id_created',
            columns: ['workflowId', 'created'],
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
                foreignKeyConstraintName: 'fk_deduped_event_project_id',
            },
        },
        workflow: {
            type: 'many-to-one',
            target: 'workflow',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'workflowId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_deduped_event_workflow_id',
            },
        },
    },
})
