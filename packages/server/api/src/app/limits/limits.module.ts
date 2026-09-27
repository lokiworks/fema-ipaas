import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { limitsController } from './limits.controller'

export const limitsModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(limitsController, { prefix: '/v1/limits' })
}
