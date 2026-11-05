import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { tenantDomainController } from './tenant-domain.controller'

export const tenantDomainModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(tenantDomainController, { prefix: '/v1/tenant-domains' })
}
