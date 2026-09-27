import { GlobalSearchRequestQuery, GlobalSearchResponse, PrincipalType } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { globalSearchService } from './global-search.service'

export const globalSearchModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(globalSearchController, { prefix: '/v1/global-search' })
}

const globalSearchController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', SearchRequest, async (request): Promise<GlobalSearchResponse> => {
        return globalSearchService(request.log).search({
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            query: request.query.query,
        })
    })
}

const SearchRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['global-search'], querystring: GlobalSearchRequestQuery },
}
