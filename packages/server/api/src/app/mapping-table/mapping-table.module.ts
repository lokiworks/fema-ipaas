import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { entitiesMustBeOwnedByCurrentProject } from '../authentication/authorization'
import { mappingTableController, mappingTableWorkerController } from './mapping-table.controller'

export const mappingTableModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentProject)
    await app.register(mappingTableController, { prefix: '/v1/mapping-tables' })
    await app.register(mappingTableWorkerController, { prefix: '/v1/worker/mapping-tables' })
}
