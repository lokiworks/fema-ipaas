import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { McpToolDebugRequestBody, McpToolDebugResult } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { userRepo } from '../user/user-service'
import { mcpServiceMemberRepo, mcpServiceRepo, mcpServiceService } from './mcp-service.service'
import { mcpToolExecutor } from './mcp-tool-executor'
import { mcpToolModel } from './mcp-tool-model'

export const mcpServiceDebugService = (log: FastifyBaseLogger) => ({
    async debug({ tenantId, userId, id, request }: DebugParams): Promise<DebugOutcome> {
        const model = await mcpServiceService(log).get({ tenantId, userId, id })
        if (!model.canEdit) {
            throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message: 'Only the owner can debug this MCP service' } })
        }
        const service = await mcpServiceRepo().findOneByOrFail({ id })
        const tool = mcpToolModel.normalizeTools(service.tools).find((candidate) => candidate.id === request.toolId)
        if (isNil(tool)) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'McpTool', entityId: request.toolId } })
        }
        const [member, user] = await Promise.all([
            mcpServiceMemberRepo().findOneBy({ serviceId: id, userId }),
            userRepo().findOne({ where: { id: userId }, relations: { identity: true } }),
        ])
        const started = Date.now()
        const outcome = await mcpToolExecutor(log).call({
            service,
            tool,
            provided: request.arguments,
            caller: {
                member,
                user: isNil(user) ? null : {
                    id: user.id,
                    email: user.identity?.email ?? '',
                    name: isNil(user.identity) ? '' : `${user.identity.firstName} ${user.identity.lastName}`.trim(),
                },
            },
            clientName: request.clientName ?? DEBUG_CLIENT_NAME,
        })
        return {
            service: { id: model.id, name: model.name },
            toolName: tool.name,
            result: {
                isError: outcome.isError,
                text: outcome.text,
                structured: outcome.structured,
                resolvedArguments: outcome.resolvedArguments,
                durationMs: Date.now() - started,
            },
        }
    },
})

const DEBUG_CLIENT_NAME = 'debug'

type DebugParams = {
    tenantId: string
    userId: string
    id: string
    request: McpToolDebugRequestBody
}

type DebugOutcome = {
    service: { id: string, name: string }
    toolName: string
    result: McpToolDebugResult
}
