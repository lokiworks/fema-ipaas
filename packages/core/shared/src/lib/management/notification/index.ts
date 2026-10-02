import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export enum NotificationType {
    RELEASE_REQUESTED = 'RELEASE_REQUESTED',
    RELEASE_APPROVED = 'RELEASE_APPROVED',
    RELEASE_REJECTED = 'RELEASE_REJECTED',
    RELEASE_ROLLED_BACK = 'RELEASE_ROLLED_BACK',
    AGENT_APPROVAL_REQUESTED = 'AGENT_APPROVAL_REQUESTED',
    EDIT_LOCK_TAKEN_OVER = 'EDIT_LOCK_TAKEN_OVER',
    DATA_ERASURE_FINISHED = 'DATA_ERASURE_FINISHED',
    DATA_ERASURE_FAILED = 'DATA_ERASURE_FAILED',
    ISSUE_ASSIGNED = 'ISSUE_ASSIGNED',
    MODULE_ACCESS_APPROVED = 'MODULE_ACCESS_APPROVED',
    MODULE_ACCESS_REJECTED = 'MODULE_ACCESS_REJECTED',
    PROJECT_MEMBER_ADDED = 'PROJECT_MEMBER_ADDED',
    RUN_FAILED = 'RUN_FAILED',
    CONNECTION_BROKEN = 'CONNECTION_BROKEN',
    CONNECTION_REAUTH_REQUESTED = 'CONNECTION_REAUTH_REQUESTED',
    CAPACITY_THRESHOLD = 'CAPACITY_THRESHOLD',
}

export const Notification = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    projectId: Nullable(z.string()),
    recipientId: z.string(),
    type: z.enum(NotificationType),
    title: z.string(),
    body: Nullable(z.string()),
    link: Nullable(z.string()),
    actorName: Nullable(z.string()),
    read: z.boolean(),
})
export type Notification = z.infer<typeof Notification>

export const ListNotificationsRequestQuery = z.object({
    unreadOnly: z.enum(['true', 'false']).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
})
export type ListNotificationsRequestQuery = z.infer<typeof ListNotificationsRequestQuery>

export const NotificationUnreadCount = z.object({
    count: z.number(),
})
export type NotificationUnreadCount = z.infer<typeof NotificationUnreadCount>

export const NotificationChannelPreference = z.object({
    im: z.boolean(),
    email: z.boolean(),
})
export type NotificationChannelPreference = z.infer<typeof NotificationChannelPreference>

export const NotificationPreferences = z.object({
    runFailed: NotificationChannelPreference,
    connectionBroken: NotificationChannelPreference,
    projectMemberAdded: NotificationChannelPreference,
    weeklyDigest: NotificationChannelPreference,
})
export type NotificationPreferences = z.infer<typeof NotificationPreferences>
export type NotificationPreferenceEvent = keyof NotificationPreferences
export type NotificationDeliveryChannel = keyof NotificationChannelPreference

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
    runFailed: { im: false, email: true },
    connectionBroken: { im: false, email: true },
    projectMemberAdded: { im: false, email: true },
    weeklyDigest: { im: false, email: false },
}

export const NOTIFICATION_PREFERENCE_EVENTS: NotificationPreferenceEvent[] = ['runFailed', 'connectionBroken', 'projectMemberAdded', 'weeklyDigest']

export const NOTIFICATION_RETENTION_DAYS = 90
