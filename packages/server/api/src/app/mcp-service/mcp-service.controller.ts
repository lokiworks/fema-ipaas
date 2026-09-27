import { EntityId, Permission } from '@fema-ipaas/core-utils'
import {
    McpService,
    McpServiceWithToken,
    McpToolCandidate,
    PrincipalType,
    UpsertMcpServiceRequestBody,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { McpServiceEntity } from './mcp-service.entity'
import { mcpServiceService } from './mcp-service.service'

export const mcpServiceController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request): Promise<McpService[]> => {
        return mcpServiceService(request.log).list({ projectId: request.projectId })
    })

    app.get('/candidates', CandidatesRequest, async (request): Promise<McpToolCandidate[]> => {
        return mcpServiceService(request.log).candidates({ projectId: request.projectId })
    })

    app.post('/', CreateRequest, async (request, reply) => {
        const service = await mcpServiceService(request.log).create({ request: request.body })
        await reply.status(StatusCodes.CREATED).send(service)
    })

    app.post('/:id', UpdateRequest, async (request): Promise<McpService> => {
        return mcpServiceService(request.log).update({ id: request.params.id, request: { ...request.body, projectId: request.projectId } })
    })

    app.post('/:id/rotate-token', RotateRequest, async (request): Promise<McpServiceWithToken> => {
        return mcpServiceService(request.log).rotateToken({ id: request.params.id, projectId: request.projectId })
    })

    app.delete('/:id', DeleteRequest, async (request, reply) => {
        await mcpServiceService(request.log).delete({ id: request.params.id, projectId: request.projectId })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const IdParams = z.object({ id: EntityId })
const ProjectQuery = z.object({ projectId: z.string() })

const ListRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_MCP_SERVICE, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['mcp-services'], querystring: ProjectQuery, response: { [StatusCodes.OK]: z.array(McpService) } },
}

const CandidatesRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_MCP_SERVICE, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['mcp-services'], querystring: ProjectQuery, response: { [StatusCodes.OK]: z.array(McpToolCandidate) } },
}

const CreateRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_MCP_SERVICE, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['mcp-services'], body: UpsertMcpServiceRequestBody, response: { [StatusCodes.CREATED]: McpServiceWithToken } },
}

const UpdateRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_MCP_SERVICE, { type: ProjectResourceType.TABLE, tableName: McpServiceEntity }) },
    schema: { tags: ['mcp-services'], params: IdParams, body: UpsertMcpServiceRequestBody, response: { [StatusCodes.OK]: McpService } },
}

const RotateRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_MCP_SERVICE, { type: ProjectResourceType.TABLE, tableName: McpServiceEntity }) },
    schema: { tags: ['mcp-services'], params: IdParams, response: { [StatusCodes.OK]: McpServiceWithToken } },
}

const DeleteRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_MCP_SERVICE, { type: ProjectResourceType.TABLE, tableName: McpServiceEntity }) },
    schema: { tags: ['mcp-services'], params: IdParams },
}
