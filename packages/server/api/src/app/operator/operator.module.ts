import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { operatorController } from './operator.controller'

export const operatorModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(operatorController, { prefix: '/v1/operator' })
}
