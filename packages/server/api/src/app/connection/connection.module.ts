import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { entitiesMustBeOwnedByCurrentProject } from '../authentication/authorization'
import { connectionWorkerController } from './connection-worker-controller'
import { connectionController } from './connection.controller'

export const connectionModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentProject)
    await app.register(connectionController, {
        prefix: '/v1/connections',
    })
    await app.register(connectionWorkerController, {
        prefix: '/v1/worker/connections',
    })
}
