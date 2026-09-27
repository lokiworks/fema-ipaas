import { ConnectionReplacement, Project, WorkflowRelease } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export type WorkflowReleaseSchema = WorkflowRelease & {
    project?: Project
}

export type ConnectionReplacementSchema = ConnectionReplacement & {
    project?: Project
}

export const WorkflowReleaseEntity = new EntitySchema<WorkflowReleaseSchema>({
    name: 'workflow_release',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: EntityIdSchema,
        workflowId: EntityIdSchema,
        workflowVersionId: EntityIdSchema,
        previousVersionId: {
            ...EntityIdSchema,
            nullable: true,
        },
        status: {
            type: String,
        },
        note: {
            type: 'text',
        },
        requestedById: EntityIdSchema,
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
            type: 'text',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_workflow_release_project_id_created',
            columns: ['projectId', 'created'],
        },
        {
            name: 'idx_workflow_release_workflow_id_status',
            columns: ['workflowId', 'status'],
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
                foreignKeyConstraintName: 'fk_workflow_release_project_id',
            },
        },
    },
})

export const ConnectionReplacementEntity = new EntitySchema<ConnectionReplacementSchema>({
    name: 'connection_replacement',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: EntityIdSchema,
        sourceConnectionId: EntityIdSchema,
        targetConnectionId: EntityIdSchema,
    },
    indices: [
        {
            name: 'idx_connection_replacement_project_id_source',
            columns: ['projectId', 'sourceConnectionId'],
            unique: true,
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
                foreignKeyConstraintName: 'fk_connection_replacement_project_id',
            },
        },
    },
})
