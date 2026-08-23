import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { componentController } from './component.controller'

export const componentModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(componentController, { prefix: '/v1/components' })
}
