import { Notification, Project, Tenant, User } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export const NotificationEntity = new EntitySchema<NotificationSchema>({
    name: 'notification',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        projectId: {
            ...EntityIdSchema,
            nullable: true,
        },
        recipientId: EntityIdSchema,
        type: {
            type: String,
            nullable: false,
        },
        title: {
            type: String,
            nullable: false,
        },
        body: {
            type: String,
            nullable: true,
        },
        link: {
            type: String,
            nullable: true,
        },
        actorName: {
            type: String,
            nullable: true,
        },
        read: {
            type: Boolean,
            nullable: false,
            default: false,
        },
    },
    indices: [
        {
            name: 'idx_notification_recipient_created',
            columns: ['recipientId', 'created'],
        },
        {
            name: 'idx_notification_recipient_read',
            columns: ['recipientId', 'read'],
        },
        {
            name: 'idx_notification_created',
            columns: ['created'],
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                foreignKeyConstraintName: 'fk_notification_tenant_id',
            },
        },
        project: {
            type: 'many-to-one',
            target: 'project',
            onDelete: 'CASCADE',
            nullable: true,
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_notification_project_id',
            },
        },
        recipient: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'recipientId',
                foreignKeyConstraintName: 'fk_notification_recipient_id',
            },
        },
    },
})

type NotificationSchema = Notification & {
    tenant: Tenant
    project: Project | null
    recipient: User
}
