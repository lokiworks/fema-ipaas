import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export enum NotificationChannelType {
    FEISHU = 'FEISHU',
    WECOM = 'WECOM',
    DINGTALK = 'DINGTALK',
    SLACK = 'SLACK',
    WEBHOOK = 'WEBHOOK',
    EMAIL = 'EMAIL',
}

export enum NotificationChannelStatus {
    ACTIVE = 'ACTIVE',
    UNAVAILABLE = 'UNAVAILABLE',
}

export enum AlertTriggerEvent {
    ISSUE_NEW = 'ISSUE_NEW',
    ISSUE_REOPENED = 'ISSUE_REOPENED',
    CONNECTION_INVALID = 'CONNECTION_INVALID',
    FAILURE_RATE = 'FAILURE_RATE',
}

export enum AlertRecordKind {
    NEW = 'NEW',
    REOPENED = 'REOPENED',
    THRESHOLD = 'THRESHOLD',
    ESCALATED = 'ESCALATED',
    STILL_FAILING = 'STILL_FAILING',
}

export enum AlertRecordStatus {
    PENDING = 'PENDING',
    SENT = 'SENT',
    FAILED = 'FAILED',
}

export const FAILURE_RATE_WINDOWS_MINUTES = [15, 60, 360, 1440] as const

export const QuietHours = z.object({
    enabled: z.boolean(),
    from: z.string().regex(timeOfDayPattern(), 'invalidTimeOfDay'),
    to: z.string().regex(timeOfDayPattern(), 'invalidTimeOfDay'),
    timezone: z.string(),
})
export type QuietHours = z.infer<typeof QuietHours>

export const AlertEscalation = z.object({
    enabled: z.boolean(),
    afterMinutes: z.number().int().min(5).max(1440),
    channelId: z.string().nullable(),
})
export type AlertEscalation = z.infer<typeof AlertEscalation>

export const FailureRateCondition = z.object({
    thresholdPercent: z.number().int().min(1).max(100),
    windowMinutes: z.number().int(),
})
export type FailureRateCondition = z.infer<typeof FailureRateCondition>

export const NotificationChannel = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    name: z.string(),
    type: z.enum(NotificationChannelType),
    target: z.string(),
    hasSecret: z.boolean(),
    status: z.enum(NotificationChannelStatus),
    createdById: Nullable(z.string()),
    usedByPolicies: z.number(),
})
export type NotificationChannel = z.infer<typeof NotificationChannel>

export const AlertPolicy = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    name: z.string(),
    enabled: z.boolean(),
    projectIds: z.array(z.string()),
    workflowIds: z.array(z.string()),
    events: z.array(z.enum(AlertTriggerEvent)),
    failureRate: Nullable(FailureRateCondition),
    groupWindowMinutes: z.number(),
    quietHours: QuietHours,
    escalation: AlertEscalation,
    channelIds: z.array(z.string()),
    updatedById: Nullable(z.string()),
})
export type AlertPolicy = z.infer<typeof AlertPolicy>

export const AlertRecord = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    policyId: z.string(),
    projectId: Nullable(z.string()),
    issueId: Nullable(z.string()),
    kind: z.enum(AlertRecordKind),
    channelIds: z.array(z.string()),
    mergedCount: z.number(),
    status: z.enum(AlertRecordStatus),
    scheduledAt: z.string(),
    sentAt: Nullable(z.string()),
    error: Nullable(z.string()),
    summary: z.string(),
})
export type AlertRecord = z.infer<typeof AlertRecord>

function timeOfDayPattern(): RegExp {
    return /^([01]\d|2[0-3]):[0-5]\d$/
}
