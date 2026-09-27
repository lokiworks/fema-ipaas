import {
    ApplicationEventName,
    ListMcpServersRequestQuery,
    McpServer,
    McpServerProbeResult,
    McpServerSaveResponse,
    McpServerToolTrialResult,
    McpServerUsage,
    PrincipalType,
    SyncMcpServerToolsResponse,
    TestMcpServerRequestBody,
    TryMcpServerToolRequestBody,
    UpsertMcpServerRequestBody,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { mcpServerService } from './mcp-server.service'

export const mcpServerController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request): Promise<McpServer[]> => {
        return mcpServerService(request.log).list({
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            search: request.query.search,
        })
    })

    app.post('/test', TestRequest, async (request): Promise<McpServerProbeResult> => {
        return mcpServerService(request.log).test({
            tenantId: request.principal.tenant.id,
            principal: principalOf(request.principal),
            request: request.body,
        })
    })

    app.post('/', CreateRequest, async (request, reply) => {
        const saved = await mcpServerService(request.log).create({
            tenantId: request.principal.tenant.id,
            principal: principalOf(request.principal),
            request: request.body,
        })
        await reply.status(StatusCodes.CREATED).send(saved)
    })

    app.get('/:id', GetRequest, async (request): Promise<McpServer> => {
        return mcpServerService(request.log).get({
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            id: request.params.id,
        })
    })

    app.post('/:id', UpdateRequest, async (request): Promise<McpServerSaveResponse> => {
        return mcpServerService(request.log).update({
            tenantId: request.principal.tenant.id,
            principal: principalOf(request.principal),
            id: request.params.id,
            request: request.body,
        })
    })

    app.post('/:id/sync', SyncRequest, async (request): Promise<SyncMcpServerToolsResponse> => {
        return mcpServerService(request.log).sync({
            tenantId: request.principal.tenant.id,
            principal: principalOf(request.principal),
            id: request.params.id,
        })
    })

    app.post('/:id/tools/try', TryToolRequest, async (request): Promise<McpServerToolTrialResult> => {
        const { result, connection } = await mcpServerService(request.log).tryTool({
            tenantId: request.principal.tenant.id,
            principal: principalOf(request.principal),
            id: request.params.id,
            request: request.body,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.MCP_TOOL_TRIED,
            data: {
                server: { id: connection.id, displayName: connection.displayName },
                toolName: request.body.toolName,
                success: result.ok && !result.isError,
            },
        })
        return result
    })

    app.get('/:id/usage', UsageRequest, async (request): Promise<McpServerUsage> => {
        return mcpServerService(request.log).usage({
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            id: request.params.id,
        })
    })

    app.delete('/:id', DeleteRequest, async (request, reply) => {
        const connection = await mcpServerService(request.log).delete({
            tenantId: request.principal.tenant.id,
            principal: principalOf(request.principal),
            id: request.params.id,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.CONNECTION_DELETED,
            data: {
                connection: {
                    id: connection.id,
                    displayName: connection.displayName,
                    externalId: connection.externalId,
                    connectorName: connection.connectorName,
                    status: connection.status,
                    type: connection.type,
                    created: connection.created,
                    updated: connection.updated,
                },
            },
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

function principalOf(principal: { id: string, type: PrincipalType, tenant: { id: string } }): { id: string, type: PrincipalType, tenantId: string } {
    return { id: principal.id, type: principal.type, tenantId: principal.tenant.id }
}

const IdParams = z.object({ id: z.string() })
const userOnly = securityAccess.publicTenant([PrincipalType.USER])

const ListRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['mcp-servers'],
        description: 'List the external MCP servers available to the current user.',
        querystring: ListMcpServersRequestQuery.partial(),
        response: { [StatusCodes.OK]: z.array(McpServer) },
    },
}

const TestRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['mcp-servers'],
        description: 'Let a worker connect to an MCP server and list its tools without saving anything.',
        body: TestMcpServerRequestBody,
        response: { [StatusCodes.OK]: McpServerProbeResult },
    },
}

const CreateRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['mcp-servers'],
        description: 'Add an external MCP server. It is tested from a worker first.',
        body: UpsertMcpServerRequestBody,
        response: { [StatusCodes.CREATED]: McpServerSaveResponse },
    },
}

const GetRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['mcp-servers'],
        params: IdParams,
        response: { [StatusCodes.OK]: McpServer },
    },
}

const UpdateRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['mcp-servers'],
        description: 'Change an external MCP server. Changed connection settings are tested again.',
        params: IdParams,
        body: UpsertMcpServerRequestBody,
        response: { [StatusCodes.OK]: McpServerSaveResponse },
    },
}

const SyncRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['mcp-servers'],
        description: 'Read the tool list of the server again and report added and removed tools.',
        params: IdParams,
        response: { [StatusCodes.OK]: SyncMcpServerToolsResponse },
    },
}

const TryToolRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['mcp-servers'],
        description: 'Call one tool of the server from a worker. The call really executes and is audited.',
        params: IdParams,
        body: TryMcpServerToolRequestBody,
        response: { [StatusCodes.OK]: McpServerToolTrialResult },
    },
}

const UsageRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['mcp-servers'],
        description: 'List the workflow steps and agent tools that use this server.',
        params: IdParams,
        response: { [StatusCodes.OK]: McpServerUsage },
    },
}

const DeleteRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['mcp-servers'],
        description: 'Delete an MCP server that no workflow uses.',
        params: IdParams,
    },
}
