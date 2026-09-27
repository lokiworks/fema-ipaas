import { SeekPage } from '@fema-ipaas/core-utils'
import { ApplicationEventName, ListAuditEventsRequest, PrincipalType } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { AuditEventRow } from './audit-event.entity'
import { auditEventService } from './audit-event.service'

export const auditEventController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListAuditEventsRouteConfig, async (request): Promise<SeekPage<AuditEventRow>> => {
        return auditEventService(request.log).list({
            tenantId: request.principal.tenant.id,
            projectId: request.query.projectId,
            action: request.query.action,
            userId: request.query.userId,
            createdAfter: request.query.createdAfter,
            createdBefore: request.query.createdBefore,
            cursor: request.query.cursor ?? null,
            limit: Math.min(request.query.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
        })
    })

    app.post('/exports', RecordExportRouteConfig, async (request, reply) => {
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.AUDIT_LOG_EXPORTED,
            data: { target: 'audit-log', detail: `${request.body.rows} rows` },
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500

const ListAuditEventsRouteConfig = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        querystring: ListAuditEventsRequest,
    },
}

const RecordExportRouteConfig = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    schema: {
        body: z.object({ rows: z.number().int().min(0) }),
    },
}
