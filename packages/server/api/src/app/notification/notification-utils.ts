import { isNil } from '@fema-ipaas/core-utils'
import { Notification, NotificationResolution, NotificationType, ProjectAccessRequestStatus } from '@fema-ipaas/shared'
import dayjs from 'dayjs'

function resolveRecipients({ recipientIds, actorId }: ResolveRecipientsParams): string[] {
    const unique = [...new Set(recipientIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    return isNil(actorId) ? unique : unique.filter((id) => id !== actorId)
}

function buildRows({ input, recipientIds, actorName, now, generateId }: BuildRowsParams): Notification[] {
    return recipientIds.map((recipientId) => ({
        id: generateId(),
        created: now,
        updated: now,
        tenantId: input.tenantId,
        projectId: input.projectId ?? null,
        recipientId,
        type: input.type,
        title: truncate({ value: input.title, max: TITLE_MAX_LENGTH }),
        body: isNil(input.body) ? null : truncate({ value: input.body, max: BODY_MAX_LENGTH }),
        link: input.link ?? null,
        actorName: actorName ?? null,
        subjectId: input.subjectId ?? null,
        resolution: null,
        read: false,
    }))
}

function accessRequestResolution(status: ProjectAccessRequestStatus): NotificationResolution | null {
    switch (status) {
        case ProjectAccessRequestStatus.APPROVED:
            return NotificationResolution.APPROVED
        case ProjectAccessRequestStatus.REJECTED:
            return NotificationResolution.REJECTED
        case ProjectAccessRequestStatus.WITHDRAWN:
            return NotificationResolution.WITHDRAWN
        case ProjectAccessRequestStatus.PENDING:
            return null
    }
}

function retentionCutoff({ now, days }: { now: Date, days: number }): string {
    return dayjs(now).subtract(days, 'day').toISOString()
}

function truncate({ value, max }: { value: string, max: number }): string {
    return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export const notificationUtils = {
    resolveRecipients,
    buildRows,
    retentionCutoff,
    accessRequestResolution,
}

const TITLE_MAX_LENGTH = 200
const BODY_MAX_LENGTH = 1000

export type NotifyInput = {
    tenantId: string
    projectId?: string | null
    recipientIds: (string | null | undefined)[]
    type: NotificationType
    title: string
    body?: string | null
    link?: string | null
    actorId?: string | null
    subjectId?: string | null
}

type ResolveRecipientsParams = {
    recipientIds: (string | null | undefined)[]
    actorId?: string | null
}

type BuildRowsParams = {
    input: NotifyInput
    recipientIds: string[]
    actorName: string | null
    now: string
    generateId: () => string
}
