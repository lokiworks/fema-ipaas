import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import {
    entitiesMustBeOwnedByCurrentWorkspace,
} from '../authentication/authorization'
import { storeEntryController } from './store-entry.controller'

export const storeEntryModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentWorkspace)
    await app.register(storeEntryController, { prefix: '/v1/store-entries' })
}
