import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { openApiImportController } from './openapi-import.controller'

export const openApiImportModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(openApiImportController, { prefix: '/v1/connectors/openapi' })
}
