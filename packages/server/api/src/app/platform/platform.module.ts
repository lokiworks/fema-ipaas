import { PLATFORM_API } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { platformController } from './platform.controller'

export const platformModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(platformController, { prefix: PLATFORM_API.basePath })
}
