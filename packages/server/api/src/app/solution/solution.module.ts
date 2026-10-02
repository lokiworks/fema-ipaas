import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { solutionController } from './solution.controller'

export const solutionModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(solutionController, { prefix: '/v1/solutions' })
}
