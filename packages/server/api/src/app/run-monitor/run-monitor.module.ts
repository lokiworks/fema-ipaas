import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { runMonitorController } from './run-monitor.controller'

export const runMonitorModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(runMonitorController, { prefix: '/v1/run-monitor' })
}
