import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { projectWorkspaceController } from './project-workspace.controller'

export const projectWorkspaceModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(projectWorkspaceController, { prefix: '/v1/project-workspace' })
}
