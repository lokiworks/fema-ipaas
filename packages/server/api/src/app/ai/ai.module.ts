import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { aiController, aiWorkerController } from './ai.controller'

export const aiModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(aiController, { prefix: '/v1/ai' })
    await app.register(aiWorkerController, { prefix: '/v1/worker' })
}
