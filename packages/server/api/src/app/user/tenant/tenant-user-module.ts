import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { tenantUserController } from './tenant-user-controller'

export const tenantUserModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(tenantUserController, { prefix: '/v1/users' })
}
