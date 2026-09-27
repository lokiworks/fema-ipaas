import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { homeController } from './home.controller'

export const homeModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(homeController, { prefix: '/v1/home' })
}
