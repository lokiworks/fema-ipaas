import {
    AlertEscalation,
    AlertRecordKind,
    AlertRecordStatus,
    AlertTriggerEvent,
    FailureRateCondition,
    NotificationChannelType,
    QuietHours,
    Tenant,
} from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'
import { EncryptedObject } from '../helper/encryption'

export const NotificationChannelEntity = new EntitySchema<NotificationChannelSchema>({
    name: 'notification_channel',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        name: {
            type: String,
        },
        type: {
            type: String,
        },
        target: {
            type: String,
        },
        config: {
            type: 'jsonb',
        },
        hasSecret: {
            type: Boolean,
            default: false,
        },
        createdById: {
            ...EntityIdSchema,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_notification_channel_tenant_id_name',
            columns: ['tenantId', 'name'],
            unique: true,
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_notification_channel_tenant_id',
            },
        },
    },
})

export const AlertPolicyEntity = new EntitySchema<AlertPolicySchema>({
    name: 'alert_policy',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        name: {
            type: String,
        },
        enabled: {
            type: Boolean,
            default: true,
        },
        projectIds: {
            type: String,
            array: true,
            nullable: false,
        },
        workflowIds: {
            type: String,
            array: true,
            nullable: false,
        },
        events: {
            type: String,
            array: true,
            nullable: false,
        },
        failureRate: {
            type: 'jsonb',
            nullable: true,
        },
        capacityThresholdPercent: {
            type: Number,
            nullable: true,
        },
        groupWindowMinutes: {
            type: Number,
        },
        quietHours: {
            type: 'jsonb',
        },
        escalation: {
            type: 'jsonb',
        },
        channelIds: {
            type: String,
            array: true,
            nullable: false,
        },
        updatedById: {
            ...EntityIdSchema,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_alert_policy_tenant_id_name',
            columns: ['tenantId', 'name'],
            unique: true,
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'tenantId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_alert_policy_tenant_id',
            },
        },
    },
})

export const AlertRecordEntity = new EntitySchema<AlertRecordSchema>({
    name: 'alert_record',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        policyId: EntityIdSchema,
        projectId: {
            ...EntityIdSchema,
            nullable: true,
        },
        issueId: {
            ...EntityIdSchema,
            nullable: true,
        },
        kind: {
            type: String,
        },
        channelIds: {
            type: String,
            array: true,
            nullable: false,
        },
        mergedCount: {
            type: Number,
            default: 1,
        },
        status: {
            type: String,
        },
        scheduledAt: {
            type: 'timestamp with time zone',
        },
        sentAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
        error: {
            type: 'text',
            nullable: true,
        },
        summary: {
            type: 'text',
        },
    },
    indices: [
        {
            name: 'idx_alert_record_tenant_id_created',
            columns: ['tenantId', 'created'],
        },
        {
            name: 'idx_alert_record_policy_id_issue_id_created',
            columns: ['policyId', 'issueId', 'created'],
        },
        {
            name: 'idx_alert_record_status_scheduled_at',
            columns: ['status', 'scheduledAt'],
        },
    ],
    relations: {
        policy: {
            type: 'many-to-one',
            target: 'alert_policy',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'policyId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_alert_record_policy_id',
            },
        },
    },
})

export type NotificationChannelSchema = {
    id: string
    created: string
    updated: string
    tenantId: string
    name: string
    type: NotificationChannelType
    target: string
    config: EncryptedObject
    hasSecret: boolean
    createdById: string | null
    tenant?: Tenant
}

export type AlertPolicySchema = {
    id: string
    created: string
    updated: string
    tenantId: string
    name: string
    enabled: boolean
    projectIds: string[]
    workflowIds: string[]
    events: AlertTriggerEvent[]
    failureRate: FailureRateCondition | null
    capacityThresholdPercent: number | null
    groupWindowMinutes: number
    quietHours: QuietHours
    escalation: AlertEscalation
    channelIds: string[]
    updatedById: string | null
    tenant?: Tenant
}

export type AlertRecordSchema = {
    id: string
    created: string
    updated: string
    tenantId: string
    policyId: string
    projectId: string | null
    issueId: string | null
    kind: AlertRecordKind
    channelIds: string[]
    mergedCount: number
    status: AlertRecordStatus
    scheduledAt: string
    sentAt: string | null
    error: string | null
    summary: string
    policy?: AlertPolicySchema
}

export type NotificationChannelConfig = {
    url: string | null
    secret: string | null
    recipients: string[]
}
