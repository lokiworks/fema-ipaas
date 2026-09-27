import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { accountController } from './account.controller'

export const accountModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(accountController, { prefix: '/v1/account' })
}
