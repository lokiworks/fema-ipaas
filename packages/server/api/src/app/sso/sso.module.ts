import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { federationModule } from '../federation/federation.module'
import { platformLoginAppsController } from './platform-login-apps.controller'
import { ssoAdminController } from './sso-admin.controller'
import { ssoController } from './sso.controller'

export const ssoModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(ssoController, { prefix: '/v1/authn/sso' })
    await app.register(ssoAdminController, { prefix: '/v1/tenant-access/sso' })
    await app.register(platformLoginAppsController, { prefix: '/v1/operator/platform-login-apps' })
    await app.register(federationModule)
}
