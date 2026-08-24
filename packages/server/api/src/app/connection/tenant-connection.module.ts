import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { globalConnectionController } from './global-connection.controller'
import { tenantConnectionController } from './tenant-connection.controller'

export const tenantConnectionModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(tenantConnectionController, {
        prefix: '/v1/tenant-connections',
    })
    await app.register(globalConnectionController, {
        prefix: '/v1/global-connections',
    })
}
