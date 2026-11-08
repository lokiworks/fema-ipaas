import { PLATFORM_API } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { platformController } from './platform.controller'
import { platformJobs } from './platform.jobs'

export const platformModule: FastifyPluginAsyncZod = async (app) => {
    await platformJobs.register({ log: app.log })
    await app.register(platformController, { prefix: PLATFORM_API.basePath })
}
