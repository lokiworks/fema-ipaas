import {
    isNil,
    MCP_PROTOCOL_VERSION,
    McpErrorCode,
    McpIncomingRequest,
    McpServiceStatus,
    mcpWire,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { McpServiceSchema } from './mcp-service.entity'
import { AuthenticatedCaller, McpRoute, mcpServiceKeys, mcpServiceService } from './mcp-service.service'
import { mcpToolExecutor } from './mcp-tool-executor'
import { mcpToolModel } from './mcp-tool-model'

export const mcpEndpointController: FastifyPluginAsyncZod = async (app) => {
    app.post('/:id', EndpointRequest, async (request, reply) => {
        await serve({ request, reply, route: { kind: 'id', value: request.params.id } })
    })
    app.get('/:id', EndpointRequest, async (_request, reply) => {
        await methodNotAllowed(reply)
    })
    app.delete('/:id', EndpointRequest, async (_request, reply) => {
        await methodNotAllowed(reply)
    })
}

export const mcpKeyEndpointController: FastifyPluginAsyncZod = async (app) => {
    app.post('/:id', EndpointRequest, async (request, reply) => {
        await serve({ request, reply, route: { kind: 'key', value: request.params.id } })
    })
    app.get('/:id', EndpointRequest, async (_request, reply) => {
        await methodNotAllowed(reply)
    })
    app.delete('/:id', EndpointRequest, async (_request, reply) => {
        await methodNotAllowed(reply)
    })
}

async function serve({ request, reply, route }: ServeParams): Promise<void> {
    const caller = await mcpServiceService(request.log).authenticate({ route, authorization: headerValue(request.headers.authorization) })
    if (isNil(caller)) {
        await reply.status(StatusCodes.UNAUTHORIZED).header('www-authenticate', 'Bearer').send(mcpWire.error({ id: null, code: McpErrorCode.INVALID_REQUEST, message: 'Invalid or missing API key' }))
        return
    }
    const status = mcpServiceKeys.statusOf(caller.service)
    if (status !== McpServiceStatus.ENABLED) {
        await reply.status(StatusCodes.FORBIDDEN).send(mcpWire.error({
            id: null,
            code: McpErrorCode.INVALID_REQUEST,
            message: status === McpServiceStatus.DRAFT ? 'This MCP service has not been published yet' : 'This MCP service is paused',
        }))
        return
    }
    const message = mcpWire.parseRequest(request.body)
    if (isNil(message)) {
        await reply.status(StatusCodes.BAD_REQUEST).send(mcpWire.error({ id: null, code: McpErrorCode.INVALID_REQUEST, message: 'Expected a JSON-RPC 2.0 request' }))
        return
    }
    if (isNil(message.id)) {
        await reply.status(StatusCodes.ACCEPTED).send()
        return
    }
    const sessionHeader = headerValue(request.headers['mcp-session-id'])
    if (message.method === 'initialize') {
        const clientName = clientNameOf(message.params)
        await reply.status(StatusCodes.OK)
            .header('content-type', 'application/json')
            .header('mcp-session-id', sessionIdFor(clientName))
            .send(initializeResult({ service: caller.service, message, id: message.id }))
        return
    }
    const response = await handle({
        log: request.log,
        caller,
        message,
        id: message.id,
        clientName: clientNameFromSession(sessionHeader),
    })
    await reply.status(StatusCodes.OK).header('content-type', 'application/json').send(response)
}

async function handle({ log, caller, message, id, clientName }: HandleParams): Promise<Record<string, unknown>> {
    const tools = servedTools(caller.service)
    switch (message.method) {
        case 'ping':
            return mcpWire.result({ id, value: {} })
        case 'tools/list':
            return mcpWire.result({
                id,
                value: {
                    tools: tools.map((tool) => ({
                        name: tool.name,
                        ...(tool.title.length > 0 && tool.title !== tool.name ? { title: tool.title } : {}),
                        description: tool.description,
                        inputSchema: mcpToolModel.inputSchemaOf(tool),
                    })),
                },
            })
        case 'tools/call': {
            const parsed = ToolCallParams.safeParse(message.params)
            if (!parsed.success) {
                return mcpWire.result({ id, value: toolError('Expected a tool name and an arguments object') })
            }
            const tool = tools.find((candidate) => candidate.name === parsed.data.name)
            if (isNil(tool)) {
                return mcpWire.result({ id, value: toolError(`Tool ${parsed.data.name} does not exist in this service`) })
            }
            const outcome = await mcpToolExecutor(log).call({
                service: caller.service,
                tool,
                provided: parsed.data.arguments ?? {},
                caller: { member: caller.member, user: caller.user },
                clientName,
            })
            await mcpServiceService(log).recordCall({ serviceId: caller.service.id, failed: outcome.isError })
            return mcpWire.result({
                id,
                value: {
                    content: [{ type: 'text', text: outcome.text }],
                    ...(isNil(outcome.structured) ? {} : { structuredContent: outcome.structured }),
                    isError: outcome.isError,
                },
            })
        }
        default:
            return mcpWire.error({ id, code: McpErrorCode.METHOD_NOT_FOUND, message: `Method not supported: ${message.method}` })
    }
}

function servedTools(service: McpServiceSchema): ReturnType<typeof mcpToolModel.normalizeTools> {
    return mcpServiceKeys.isLegacy(service)
        ? mcpToolModel.normalizeTools(service.tools)
        : mcpToolModel.normalizeTools(service.publishedTools ?? [])
}

function initializeResult({ service, message, id }: { service: McpServiceSchema, message: McpIncomingRequest, id: string | number }): Record<string, unknown> {
    return mcpWire.result({
        id,
        value: {
            protocolVersion: typeof message.params.protocolVersion === 'string' ? message.params.protocolVersion : MCP_PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: service.key ?? service.name, title: service.name, version: service.releases[0]?.version ?? SERVER_VERSION },
            ...(service.description.length > 0 ? { instructions: service.description } : {}),
        },
    })
}

function clientNameOf(params: Record<string, unknown>): string {
    const parsed = ClientInfo.safeParse(params.clientInfo)
    return parsed.success ? parsed.data.name.slice(0, CLIENT_NAME_LIMIT) : ''
}

function sessionIdFor(clientName: string): string {
    return `${SESSION_PREFIX}${Buffer.from(clientName, 'utf8').toString('base64url')}.${Date.now().toString(36)}`
}

function clientNameFromSession(sessionId: string | undefined): string {
    if (isNil(sessionId) || !sessionId.startsWith(SESSION_PREFIX)) {
        return ''
    }
    const encoded = sessionId.slice(SESSION_PREFIX.length).split('.')[0] ?? ''
    return Buffer.from(encoded, 'base64url').toString('utf8').slice(0, CLIENT_NAME_LIMIT)
}

function headerValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value
}

async function methodNotAllowed(reply: FastifyReply): Promise<void> {
    await reply.status(StatusCodes.METHOD_NOT_ALLOWED).header('allow', 'POST').send()
}

function toolError(text: string): Record<string, unknown> {
    return { content: [{ type: 'text', text }], isError: true }
}

const SERVER_VERSION = '1.0'
const SESSION_PREFIX = 'c.'
const CLIENT_NAME_LIMIT = 100

const ToolCallParams = z.object({
    name: z.string(),
    arguments: z.record(z.string(), z.unknown()).optional(),
})

const ClientInfo = z.object({
    name: z.string(),
})

const EndpointRequest = {
    config: { security: securityAccess.public() },
    schema: { params: z.object({ id: z.string() }) },
}

type ServeParams = {
    request: Pick<FastifyRequest, 'log' | 'headers' | 'body'>
    reply: FastifyReply
    route: McpRoute
}

type HandleParams = {
    log: FastifyBaseLogger
    caller: AuthenticatedCaller
    message: McpIncomingRequest
    id: string | number
    clientName: string
}
