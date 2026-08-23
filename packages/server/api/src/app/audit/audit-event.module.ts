import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { auditEventController } from './audit-event.controller'

export const auditEventModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(auditEventController, { prefix: '/v1/audit-events' })
}
