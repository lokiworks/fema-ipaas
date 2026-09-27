import { EntityId, SeekPage } from '@fema-ipaas/core-utils'
import {
    AlertPolicy,
    AlertRecord,
    AlertRecordStats,
    ListAlertRecordsRequestQuery,
    NotificationChannel,
    PrincipalType,
    TestNotificationChannelResponse,
    UpsertAlertPolicyRequestBody,
    UpsertNotificationChannelRequestBody,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { emailService } from '../helper/email/email-service'
import { alertPolicyService } from './alert-policy.service'
import { alertRecordService } from './alert-record.service'
import { notificationChannelService } from './notification-channel.service'

export const alertController: FastifyPluginAsyncZod = async (app) => {
    app.get('/capabilities', AdminRequest, async (request) => {
        return { emailConfigured: emailService(request.log).isConfigured() }
    })

    app.get('/channels', AdminRequest, async (request): Promise<NotificationChannel[]> => {
        return notificationChannelService(request.log).list({ tenantId: request.principal.tenant.id })
    })

    app.post('/channels', UpsertChannelRequest, async (request, reply) => {
        const channel = await notificationChannelService(request.log).create({
            tenantId: request.principal.tenant.id,
            request: request.body,
            actorId: request.principal.id,
        })
        await reply.status(StatusCodes.CREATED).send(channel)
    })

    app.post('/channels/:id', UpsertChannelWithIdRequest, async (request): Promise<NotificationChannel> => {
        return notificationChannelService(request.log).update({ id: request.params.id, tenantId: request.principal.tenant.id, request: request.body })
    })

    app.delete('/channels/:id', IdRequest, async (request, reply) => {
        await notificationChannelService(request.log).delete({ id: request.params.id, tenantId: request.principal.tenant.id })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.post('/channels/:id/test', IdRequest, async (request): Promise<TestNotificationChannelResponse> => {
        return notificationChannelService(request.log).test({ id: request.params.id, tenantId: request.principal.tenant.id })
    })

    app.get('/policies', AdminRequest, async (request): Promise<AlertPolicy[]> => {
        return alertPolicyService(request.log).list({ tenantId: request.principal.tenant.id })
    })

    app.post('/policies', UpsertPolicyRequest, async (request, reply) => {
        const policy = await alertPolicyService(request.log).create({
            tenantId: request.principal.tenant.id,
            request: request.body,
            actorId: request.principal.id,
        })
        await reply.status(StatusCodes.CREATED).send(policy)
    })

    app.post('/policies/:id', UpsertPolicyWithIdRequest, async (request): Promise<AlertPolicy> => {
        return alertPolicyService(request.log).update({
            id: request.params.id,
            tenantId: request.principal.tenant.id,
            request: request.body,
            actorId: request.principal.id,
        })
    })

    app.delete('/policies/:id', IdRequest, async (request, reply) => {
        await alertPolicyService(request.log).delete({ id: request.params.id, tenantId: request.principal.tenant.id })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.get('/records', ListRecordsRequest, async (request): Promise<SeekPage<AlertRecord>> => {
        return alertRecordService(request.log).list({ tenantId: request.principal.tenant.id, query: request.query })
    })

    app.get('/records/stats', AdminRequest, async (request): Promise<AlertRecordStats> => {
        return alertRecordService(request.log).stats({ tenantId: request.principal.tenant.id, projectId: undefined })
    })
}

const adminOnly = securityAccess.tenantAdminOnly([PrincipalType.USER])
const IdParams = z.object({ id: EntityId })

const AdminRequest = {
    config: { security: adminOnly },
    schema: { tags: ['alerts'] },
}

const IdRequest = {
    config: { security: adminOnly },
    schema: { tags: ['alerts'], params: IdParams },
}

const UpsertChannelRequest = {
    config: { security: adminOnly },
    schema: { tags: ['alerts'], body: UpsertNotificationChannelRequestBody },
}

const UpsertChannelWithIdRequest = {
    config: { security: adminOnly },
    schema: { tags: ['alerts'], params: IdParams, body: UpsertNotificationChannelRequestBody },
}

const UpsertPolicyRequest = {
    config: { security: adminOnly },
    schema: { tags: ['alerts'], body: UpsertAlertPolicyRequestBody },
}

const UpsertPolicyWithIdRequest = {
    config: { security: adminOnly },
    schema: { tags: ['alerts'], params: IdParams, body: UpsertAlertPolicyRequestBody },
}

const ListRecordsRequest = {
    config: { security: adminOnly },
    schema: { tags: ['alerts'], querystring: ListAlertRecordsRequestQuery },
}
