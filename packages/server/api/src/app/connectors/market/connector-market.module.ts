import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { connectorDemandController, connectorUsageController } from './connector-market.controller'

export const connectorMarketModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(connectorDemandController, { prefix: '/v1/connector-demands' })
    await app.register(connectorUsageController, { prefix: '/v1/connector-usage' })
}
