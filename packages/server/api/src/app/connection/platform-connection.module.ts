import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { platformConnectionController } from './platform-connection.controller'

export const platformConnectionModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(platformConnectionController, {
        prefix: '/v1/platform-connections',
    })
}
