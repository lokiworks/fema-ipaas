import { EntityId, SeekPage } from '@fema-ipaas/core-utils'
import { ListNotificationsRequestQuery, Notification, NotificationUnreadCount, PrincipalType } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { notificationService } from './notification.service'

export const notificationController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request): Promise<SeekPage<Notification>> => {
        return notificationService(request.log).list({
            recipientId: request.principal.id,
            tenantId: request.principal.tenant.id,
            query: request.query,
        })
    })

    app.get('/unread-count', UnreadCountRequest, async (request): Promise<NotificationUnreadCount> => {
        const count = await notificationService(request.log).unreadCount({
            recipientId: request.principal.id,
            tenantId: request.principal.tenant.id,
        })
        return { count }
    })

    app.post('/read-all', ReadAllRequest, async (request, reply) => {
        await notificationService(request.log).markAllRead({
            recipientId: request.principal.id,
            tenantId: request.principal.tenant.id,
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.post('/:id/read', ReadRequest, async (request, reply) => {
        await notificationService(request.log).markRead({
            id: request.params.id,
            recipientId: request.principal.id,
            tenantId: request.principal.tenant.id,
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const userOnly = securityAccess.publicTenant([PrincipalType.USER])

const ListRequest = {
    config: { security: userOnly },
    schema: { tags: ['notifications'], querystring: ListNotificationsRequestQuery },
}

const UnreadCountRequest = {
    config: { security: userOnly },
    schema: { tags: ['notifications'] },
}

const ReadAllRequest = {
    config: { security: userOnly },
    schema: { tags: ['notifications'] },
}

const ReadRequest = {
    config: { security: userOnly },
    schema: { tags: ['notifications'], params: z.object({ id: EntityId }) },
}
