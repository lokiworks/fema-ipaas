import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { ssoModule } from '../sso/sso.module'
import { tenantAccessController } from './tenant-access.controller'
import { tenantBrandingFlags } from './tenant-branding-flags'

export const tenantAccessModule: FastifyPluginAsyncZod = async (app) => {
    tenantBrandingFlags.install()
    await app.register(tenantAccessController, { prefix: '/v1/tenant-access' })
    await app.register(ssoModule)
}
