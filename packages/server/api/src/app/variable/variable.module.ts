import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { entitiesMustBeOwnedByCurrentWorkspace } from '../authentication/authorization'
import { variableWorkerController } from './variable-worker.controller'
import { variableController } from './variable.controller'

export const variableModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentWorkspace)
    await app.register(variableController, {
        prefix: '/v1/variables',
    })
    await app.register(variableWorkerController, {
        prefix: '/v1/worker/variables',
    })
}
