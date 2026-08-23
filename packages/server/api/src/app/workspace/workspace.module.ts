import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { workspaceMemberController } from './workspace-member.controller'
import { workspaceWorkerController } from './workspace-worker-controller'
import { workspaceController } from './workspace.controller'

export const workspaceModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(workspaceController, { prefix: '/v1/workspaces' })
    await app.register(workspaceMemberController, { prefix: '/v1/workspace-members' })
    await app.register(workspaceWorkerController, { prefix: '/v1/worker/workspace' })
}
