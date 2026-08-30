import { SeekPage } from '@fema-ipaas/core-utils'
import { ListAuditEventsRequest, PrincipalType } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
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
            limit: request.query.limit ?? DEFAULT_LIMIT,
        })
    })
}

const DEFAULT_LIMIT = 50

const ListAuditEventsRouteConfig = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        querystring: ListAuditEventsRequest,
    },
}
