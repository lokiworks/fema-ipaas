import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { entitiesMustBeOwnedByCurrentProject } from '../authentication/authorization'
import { connectionReplacementController, workflowReleaseController } from './release.controller'

export const releaseModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentProject)
    await app.register(workflowReleaseController, { prefix: '/v1/workflow-releases' })
    await app.register(connectionReplacementController, { prefix: '/v1/connection-replacements' })
}
