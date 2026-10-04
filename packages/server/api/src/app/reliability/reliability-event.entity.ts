import { BaseModel } from '@fema-ipaas/core-utils'
import { Project, RateLimitUnit, ReliabilityEventKind, Workflow } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export type ReliabilityEventRecord = BaseModel<string> & {
    projectId: string
    workflowId: string
    executionId: string
    kind: ReliabilityEventKind
    eventKey: string
    stepName: string | null
    connectorName: string | null
    limitUnit: RateLimitUnit | null
    errorCode: string | null
    waitSeconds: number | null
    gapSeconds: number | null
}

export type ReliabilityEventSchema = ReliabilityEventRecord & {
    project?: Project
    workflow?: Workflow
}

export const ReliabilityEventEntity = new EntitySchema<ReliabilityEventSchema>({
    name: 'run_reliability_event',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: EntityIdSchema,
        workflowId: EntityIdSchema,
        executionId: EntityIdSchema,
        kind: {
            type: String,
        },
        eventKey: {
            type: String,
        },
        stepName: {
            type: String,
            nullable: true,
        },
        connectorName: {
            type: String,
            nullable: true,
        },
        limitUnit: {
            type: String,
            nullable: true,
        },
        errorCode: {
            type: String,
            nullable: true,
        },
        waitSeconds: {
            type: Number,
            nullable: true,
        },
        gapSeconds: {
            type: Number,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_run_reliability_event_event_key',
            columns: ['eventKey'],
            unique: true,
        },
        {
            name: 'idx_run_reliability_event_execution_id_kind',
            columns: ['executionId', 'kind'],
        },
        {
            name: 'idx_run_reliability_event_project_id_kind_created',
            columns: ['projectId', 'kind', 'created'],
        },
        {
            name: 'idx_run_reliability_event_workflow_id_created',
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
                foreignKeyConstraintName: 'fk_run_reliability_event_project_id',
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
                foreignKeyConstraintName: 'fk_run_reliability_event_workflow_id',
            },
        },
    },
})
