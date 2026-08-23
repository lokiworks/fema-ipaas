import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { tenantConnectionController } from './tenant-connection.controller'

export const tenantConnectionModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(tenantConnectionController, {
        prefix: '/v1/tenant-connections',
    })
}
