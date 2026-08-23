import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { tenantController } from './tenant.controller'

export const tenantModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(tenantController, { prefix: '/v1/tenants' })
}
