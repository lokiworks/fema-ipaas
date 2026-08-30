import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { projectMemberController } from './project-member.controller'
import { projectWorkerController } from './project-worker-controller'
import { projectController } from './project.controller'

export const projectModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(projectController, { prefix: '/v1/projects' })
    await app.register(projectMemberController, { prefix: '/v1/project-members' })
    await app.register(projectWorkerController, { prefix: '/v1/worker/project' })
}
