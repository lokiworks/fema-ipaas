import { HomeSummary, HomeSummaryRequestQuery, PrincipalType } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { homeService } from './home.service'

export const homeController: FastifyPluginAsyncZod = async (app) => {
    app.get('/summary', SummaryRequest, async (request): Promise<HomeSummary> => {
        return homeService.summary({
            userId: request.principal.id,
            tenantId: request.principal.tenant.id,
            since: request.query.since,
        })
    })
}

const SummaryRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: {
        tags: ['home'],
        querystring: HomeSummaryRequestQuery,
        response: { 200: HomeSummary },
    },
}
