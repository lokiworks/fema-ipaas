import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { mcpSubflowCallbacks } from './mcp-tool-executor'

export const mcpCallbackController: FastifyPluginAsyncZod = async (app) => {
    app.post('/:serverId/:requestId', CallbackRequest, async (request, reply) => {
        await mcpSubflowCallbacks.publish({
            log: request.log,
            serverId: request.params.serverId,
            requestId: request.params.requestId,
            token: request.query.token,
            body: request.body,
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const CallbackRequest = {
    config: { security: securityAccess.public() },
    schema: {
        params: z.object({ serverId: z.string().min(1).max(64), requestId: z.string().min(1).max(64) }),
        querystring: z.object({ token: z.string().min(1).max(128) }),
    },
}
