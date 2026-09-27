import { isNil } from '@fema-ipaas/core-utils'
import { Notification, NotificationType } from '@fema-ipaas/shared'
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
        read: false,
    }))
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
