import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { accountSecurityController } from './account-security.controller'

export const accountSecurityModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(accountSecurityController, { prefix: '/v1/users/me' })
}
