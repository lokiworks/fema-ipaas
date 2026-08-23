import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { connectorBlueprintController } from './connector-blueprint.controller'

export const connectorBlueprintModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(connectorBlueprintController, { prefix: '/v1/connector-blueprints' })
}
