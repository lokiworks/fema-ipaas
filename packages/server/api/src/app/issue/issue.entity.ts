import { Issue, IssueActivity, Project } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export type IssueSchema = Issue & {
    project: Project
}

export type IssueActivitySchema = IssueActivity & {
    issue: Issue
}

export const IssueEntity = new EntitySchema<IssueSchema>({
    name: 'issue',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: EntityIdSchema,
        kind: {
            type: String,
        },
        signature: {
            type: String,
        },
        workflowId: {
            ...EntityIdSchema,
            nullable: true,
        },
        stepName: {
            type: String,
            nullable: true,
        },
        stepDisplayName: {
            type: String,
            nullable: true,
        },
        connectionExternalId: {
            type: String,
            nullable: true,
        },
        errorCode: {
            type: String,
            nullable: true,
        },
        title: {
            type: String,
        },
        message: {
            type: 'text',
        },
        status: {
            type: String,
        },
        reopened: {
            type: Boolean,
            default: false,
        },
        assigneeId: {
            ...EntityIdSchema,
            nullable: true,
        },
        mutedUntil: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        occurrences: {
            type: Number,
            default: 0,
        },
        firstSeenAt: {
            type: 'timestamp with time zone',
        },
        lastSeenAt: {
            type: 'timestamp with time zone',
        },
        resolvedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        resolvedById: {
            ...EntityIdSchema,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_issue_project_id_signature',
            columns: ['projectId', 'signature'],
            unique: true,
        },
        {
            name: 'idx_issue_project_id_status_last_seen_at',
            columns: ['projectId', 'status', 'lastSeenAt'],
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
                foreignKeyConstraintName: 'fk_issue_project_id',
            },
        },
    },
})

export const IssueActivityEntity = new EntitySchema<IssueActivitySchema>({
    name: 'issue_activity',
    columns: {
        ...BaseColumnSchemaPart,
        issueId: EntityIdSchema,
        projectId: EntityIdSchema,
        type: {
            type: String,
        },
        actorId: {
            ...EntityIdSchema,
            nullable: true,
        },
        data: {
            type: 'jsonb',
        },
    },
    indices: [
        {
            name: 'idx_issue_activity_issue_id_created',
            columns: ['issueId', 'created'],
        },
    ],
    relations: {
        issue: {
            type: 'many-to-one',
            target: 'issue',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'issueId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_issue_activity_issue_id',
            },
        },
    },
})
