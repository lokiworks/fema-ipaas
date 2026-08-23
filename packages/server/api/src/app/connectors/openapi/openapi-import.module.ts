import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { connectorIntegrityController } from '../integrity/connector-integrity.controller'
import { openApiImportController } from './openapi-import.controller'

export const openApiImportModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(openApiImportController, { prefix: '/v1/connectors/openapi' })
    await app.register(connectorIntegrityController, { prefix: '/v1/connectors/integrity' })
}
