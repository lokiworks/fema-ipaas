import { generateId, isNil, SeekPage, tryCatch, tryCatchSync } from '@fema-ipaas/core-utils'
import { ListNotificationsRequestQuery, Notification, NOTIFICATION_RETENTION_DAYS, WebsocketClientEvent } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { LessThan } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { websocketService } from '../core/websockets.service'
import { buildPaginator } from '../helper/pagination/build-paginator'
import { paginationHelper } from '../helper/pagination/pagination-utils'
import { userService } from '../user/user-service'
import { notificationUtils, NotifyInput } from './notification-utils'
import { NotificationEntity } from './notification.entity'

export const notificationRepo = repoFactory(NotificationEntity)

export const notificationService = (log: FastifyBaseLogger) => ({
    async notify(input: NotifyInput): Promise<Notification[]> {
        const { data, error } = await tryCatch(() => createAndPush({ input, log }))
        if (!isNil(error)) {
            log.error({ error, notification: { type: input.type } }, '[notificationService#notify] Failed to create notifications')
            return []
        }
        return data ?? []
    },

    async list({ recipientId, tenantId, query }: ListParams): Promise<SeekPage<Notification>> {
        const decodedCursor = paginationHelper.decodeCursor(query.cursor ?? null)
        const paginator = buildPaginator({
            entity: NotificationEntity,
            query: {
                limit: query.limit ?? DEFAULT_PAGE_SIZE,
                order: 'DESC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const builder = notificationRepo()
            .createQueryBuilder('notification')
            .where({ recipientId, tenantId, ...(query.unreadOnly === 'true' ? { read: false } : {}) })
        const { data, cursor } = await paginator.paginate(builder)
        return paginationHelper.createPage(data, cursor)
    },

    async unreadCount({ recipientId, tenantId }: RecipientRef): Promise<number> {
        return notificationRepo().countBy({ recipientId, tenantId, read: false })
    },

    async markRead({ id, recipientId, tenantId }: RecipientRef & { id: string }): Promise<void> {
        await notificationRepo().update({ id, recipientId, tenantId }, { read: true })
    },

    async markAllRead({ recipientId, tenantId }: RecipientRef): Promise<void> {
        await notificationRepo().update({ recipientId, tenantId, read: false }, { read: true })
    },

    async purgeExpired(): Promise<number> {
        const cutoff = notificationUtils.retentionCutoff({ now: new Date(), days: NOTIFICATION_RETENTION_DAYS })
        const result = await notificationRepo().delete({ created: LessThan(cutoff) })
        const deleted = result.affected ?? 0
        log.info({ deleted }, '[notificationService#purgeExpired] Purged expired notifications')
        return deleted
    },
})

async function createAndPush({ input, log }: { input: NotifyInput, log: FastifyBaseLogger }): Promise<Notification[]> {
    const recipientIds = notificationUtils.resolveRecipients({ recipientIds: input.recipientIds, actorId: input.actorId })
    if (recipientIds.length === 0) {
        return []
    }
    const actorName = await resolveActorName({ actorId: input.actorId, log })
    const rows = notificationUtils.buildRows({ input, recipientIds, actorName, now: dayjs().toISOString(), generateId })
    await notificationRepo().insert(rows)
    rows.forEach((row) => {
        const { error } = tryCatchSync(() => websocketService.to(row.recipientId).emit(WebsocketClientEvent.NOTIFICATION_CREATED, row))
        if (!isNil(error)) {
            log.warn({ error, notification: { id: row.id } }, '[notificationService#notify] Failed to push notification over websocket')
        }
    })
    return rows
}

async function resolveActorName({ actorId, log }: { actorId: string | null | undefined, log: FastifyBaseLogger }): Promise<string | null> {
    if (isNil(actorId)) {
        return null
    }
    const { data } = await tryCatch(() => userService(log).getMetaInformation({ id: actorId }))
    if (isNil(data)) {
        return null
    }
    const name = `${data.firstName} ${data.lastName}`.trim()
    return name.length > 0 ? name : data.email
}

const DEFAULT_PAGE_SIZE = 30

type RecipientRef = {
    recipientId: string
    tenantId: string
}

type ListParams = RecipientRef & {
    query: ListNotificationsRequestQuery
}
