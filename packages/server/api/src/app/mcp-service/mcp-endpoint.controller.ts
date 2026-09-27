import {
    EngineHttpResponse,
    isNil,
    MCP_PROTOCOL_VERSION,
    McpErrorCode,
    McpIncomingRequest,
    mcpWire,
    tryCatch,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { webhookService, WebhookWorkflowVersionToRun } from '../webhooks/webhook.service'
import { McpServiceSchema } from './mcp-service.entity'
import { mcpServiceService } from './mcp-service.service'

export const mcpEndpointController: FastifyPluginAsyncZod = async (app) => {
    app.post('/:id', EndpointRequest, async (request, reply) => {
        const service = await mcpServiceService(request.log).authenticate({ id: request.params.id, authorization: request.headers.authorization })
        if (isNil(service)) {
            await reply.status(StatusCodes.UNAUTHORIZED).header('www-authenticate', 'Bearer').send(mcpWire.error({ id: null, code: McpErrorCode.INVALID_REQUEST, message: 'Invalid or missing token' }))
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
        const response = await handle({ log: request.log, service, message, id: message.id })
        await reply.status(StatusCodes.OK).header('content-type', 'application/json').send(response)
    })

    app.get('/:id', EndpointRequest, async (_request, reply) => {
        await reply.status(StatusCodes.METHOD_NOT_ALLOWED).header('allow', 'POST').send()
    })

    app.delete('/:id', EndpointRequest, async (_request, reply) => {
        await reply.status(StatusCodes.METHOD_NOT_ALLOWED).header('allow', 'POST').send()
    })
}

async function handle({ log, service, message, id }: HandleParams): Promise<Record<string, unknown>> {
    switch (message.method) {
        case 'initialize':
            return mcpWire.result({
                id,
                value: {
                    protocolVersion: typeof message.params.protocolVersion === 'string' ? message.params.protocolVersion : MCP_PROTOCOL_VERSION,
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: { name: service.name, version: SERVER_VERSION },
                    ...(service.description.length > 0 ? { instructions: service.description } : {}),
                },
            })
        case 'ping':
            return mcpWire.result({ id, value: {} })
        case 'tools/list':
            return mcpWire.result({
                id,
                value: {
                    tools: service.tools.map((tool) => ({
                        name: tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema ?? DEFAULT_INPUT_SCHEMA,
                    })),
                },
            })
        case 'tools/call':
            return mcpWire.result({ id, value: await callTool({ log, service, params: message.params }) })
        default:
            return mcpWire.error({ id, code: McpErrorCode.METHOD_NOT_FOUND, message: `Method not supported: ${message.method}` })
    }
}

async function callTool({ log, service, params }: { log: FastifyBaseLogger, service: McpServiceSchema, params: Record<string, unknown> }): Promise<Record<string, unknown>> {
    const parsed = ToolCallParams.safeParse(params)
    if (!parsed.success) {
        return toolError('Expected a tool name and an arguments object')
    }
    const tool = await mcpServiceService(log).resolveTool({ service, toolName: parsed.data.name })
    if (isNil(tool)) {
        return toolError(`Tool ${parsed.data.name} is not available. Its workflow may have been unpublished.`)
    }
    if (!tool.enabled) {
        return toolError(`Tool ${parsed.data.name} is turned off. Turn its workflow on to use it.`)
    }
    const { data, error } = await tryCatch(() => webhookService.handleWebhook({
        logger: log,
        workflowId: tool.workflowId,
        async: false,
        saveSampleData: false,
        execute: true,
        failParentOnFailure: false,
        workflowVersionToRun: WebhookWorkflowVersionToRun.LOCKED_FALL_BACK_TO_LATEST,
        data: async () => ({
            method: 'POST',
            headers: { 'content-type': 'application/json', ...tool.headers },
            body: parsed.data.arguments ?? {},
            queryParams: {},
        }),
    }))
    if (error) {
        log.warn({ error, mcpService: { id: service.id }, workflow: { id: tool.workflowId } }, '[mcpEndpoint#callTool] Workflow call failed')
        return toolError('The workflow could not be run')
    }
    return toolResult(data)
}

function toolResult(response: EngineHttpResponse): Record<string, unknown> {
    const body = response.body
    const text = typeof body === 'string' ? body : JSON.stringify(body ?? null)
    const structured = typeof body === 'object' && !isNil(body) && !Array.isArray(body) ? { structuredContent: body } : {}
    return {
        content: [{ type: 'text', text }],
        ...structured,
        isError: response.status >= StatusCodes.BAD_REQUEST,
    }
}

function toolError(text: string): Record<string, unknown> {
    return { content: [{ type: 'text', text }], isError: true }
}

const SERVER_VERSION = '1.0.0'
const DEFAULT_INPUT_SCHEMA = { type: 'object', additionalProperties: true }

const ToolCallParams = z.object({
    name: z.string(),
    arguments: z.record(z.string(), z.unknown()).optional(),
})

const EndpointRequest = {
    config: { security: securityAccess.public() },
    schema: { params: z.object({ id: z.string() }) },
}

type HandleParams = {
    log: FastifyBaseLogger
    service: McpServiceSchema
    message: McpIncomingRequest
    id: string | number
}
