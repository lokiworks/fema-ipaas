import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { workspaceService } from './workspace-service'

export const workspaceWorkerController: FastifyPluginAsyncZod = async (
    app,
) => {
    app.get('/', GetWorkerWorkspaceRequest, async (req) => {
        const workspaceId = req.principal.workspaceId
        return workspaceService(req.log).getOneOrThrow(workspaceId)
    })
}

const GetWorkerWorkspaceRequest = {
    config: {
        security: securityAccess.engine(),
    },
}
