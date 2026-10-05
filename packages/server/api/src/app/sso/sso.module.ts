import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { ssoAdminController } from './sso-admin.controller'
import { ssoController } from './sso.controller'

export const ssoModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(ssoController, { prefix: '/v1/authn/sso' })
    await app.register(ssoAdminController, { prefix: '/v1/tenant-access/sso' })
}
