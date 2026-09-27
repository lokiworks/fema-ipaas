import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { runLogController } from './run-log.controller'

export const runLogModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(runLogController, { prefix: '/v1/run-logs' })
}
