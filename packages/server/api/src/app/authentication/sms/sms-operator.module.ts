import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { smsOperatorController } from './sms-operator.controller'

export const smsOperatorModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(smsOperatorController, { prefix: '/v1/operator' })
}
