import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export const AuditEventEntity = new EntitySchema<AuditEventRow>({
    name: 'audit_event',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        workspaceId: {
            ...EntityIdSchema,
            nullable: true,
        },
        workspaceDisplayName: {
            type: String,
            nullable: true,
        },
        userId: {
            ...EntityIdSchema,
            nullable: true,
        },
        userEmail: {
            type: String,
            nullable: true,
        },
        ip: {
            type: String,
            nullable: true,
        },
        action: {
            type: String,
            nullable: false,
        },
        data: {
            type: 'jsonb',
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_audit_event_tenant_created',
            columns: ['tenantId', 'created'],
            unique: false,
        },
        {
            name: 'idx_audit_event_workspace_action',
            columns: ['workspaceId', 'action'],
            unique: false,
        },
    ],
})

export type AuditEventRow = {
    id: string
    created: string
    updated: string
    tenantId: string
    workspaceId: string | null
    workspaceDisplayName: string | null
    userId: string | null
    userEmail: string | null
    ip: string | null
    action: string
    data: AuditEventData
}

export type AuditEventData = object
