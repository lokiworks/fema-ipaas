import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { encryptionController } from './encryption.controller'

export const encryptionModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(encryptionController, { prefix: '/v1/encryption' })
}
