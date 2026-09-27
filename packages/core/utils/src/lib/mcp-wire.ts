import { z } from 'zod/mini'

export const mcpWire = {
    request,
    notification,
    headers,
    parseMessage,
    toolsOf,
    toolResultOf,
    parseRequest,
    result,
    error,
}

function request({ id, method, params }: { id: number, method: string, params?: Record<string, unknown> }): Record<string, unknown> {
    return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }
}

function notification({ method }: { method: string }): Record<string, unknown> {
    return { jsonrpc: '2.0', method }
}

function headers({ authorization, sessionId }: { authorization?: string, sessionId?: string }): Record<string, string> {
    return {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        'mcp-protocol-version': MCP_PROTOCOL_VERSION,
        ...(authorization === undefined || authorization.length === 0 ? {} : { authorization: normalizeAuthorization(authorization) }),
        ...(sessionId === undefined ? {} : { 'mcp-session-id': sessionId }),
    }
}

function parseMessage({ contentType, text, id }: { contentType: string | undefined, text: string, id: number }): McpResponse {
    const candidates = (contentType ?? '').includes('text/event-stream')
        ? text.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice('data:'.length).trim())
        : [text]
    const messages = candidates.flatMap((candidate) => {
        const parsed = JsonRpcResponse.safeParse(safeJson(candidate))
        return parsed.success ? [parsed.data] : []
    })
    const match = messages.find((message) => message.id === id) ?? messages[messages.length - 1]
    if (match === undefined) {
        throw new Error('MCP server returned an unreadable response')
    }
    if (match.error !== undefined) {
        throw new Error(`MCP error ${match.error.code}: ${match.error.message}`)
    }
    return { result: match.result ?? {} }
}

function toolsOf(listResult: Record<string, unknown>): McpTool[] {
    const parsed = ToolsListResult.safeParse(listResult)
    if (!parsed.success) {
        return []
    }
    return parsed.data.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
    }))
}

function toolResultOf(callResult: Record<string, unknown>): McpToolResult {
    const parsed = ToolCallResult.safeParse(callResult)
    if (!parsed.success) {
        return { text: JSON.stringify(callResult), isError: false, structured: null }
    }
    const text = (parsed.data.content ?? [])
        .map((block) => (block.type === 'text' ? block.text ?? '' : `[${block.type}]`))
        .join('\n')
    return {
        text,
        isError: parsed.data.isError ?? false,
        structured: parsed.data.structuredContent ?? null,
    }
}

function parseRequest(body: unknown): McpIncomingRequest | null {
    const parsed = JsonRpcRequest.safeParse(body)
    if (!parsed.success) {
        return null
    }
    return {
        id: parsed.data.id ?? null,
        method: parsed.data.method,
        params: parsed.data.params ?? {},
    }
}

function result({ id, value }: { id: string | number, value: Record<string, unknown> }): Record<string, unknown> {
    return { jsonrpc: '2.0', id, result: value }
}

function error({ id, code, message }: { id: string | number | null, code: number, message: string }): Record<string, unknown> {
    return { jsonrpc: '2.0', id, error: { code, message } }
}

function normalizeAuthorization(value: string): string {
    const trimmed = value.trim()
    return /^(bearer|basic)\s/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`
}

function safeJson(text: string): unknown {
    try {
        return JSON.parse(text)
    }
    catch {
        return null
    }
}

const JsonObject = z.record(z.string(), z.unknown())

const JsonRpcResponse = z.object({
    jsonrpc: z.literal('2.0'),
    id: z.optional(z.nullable(z.union([z.string(), z.number()]))),
    result: z.optional(JsonObject),
    error: z.optional(z.object({ code: z.number(), message: z.string() })),
})

const JsonRpcRequest = z.object({
    jsonrpc: z.literal('2.0'),
    id: z.optional(z.union([z.string(), z.number()])),
    method: z.string(),
    params: z.optional(JsonObject),
})

const ToolsListResult = z.object({
    tools: z.array(z.object({
        name: z.string(),
        description: z.optional(z.string()),
        inputSchema: z.optional(JsonObject),
    })),
})

const ToolCallResult = z.object({
    content: z.optional(z.array(z.object({ type: z.string(), text: z.optional(z.string()) }))),
    isError: z.optional(z.boolean()),
    structuredContent: z.optional(JsonObject),
})

export const MCP_PROTOCOL_VERSION = '2025-06-18'

export enum McpErrorCode {
    PARSE_ERROR = -32700,
    INVALID_REQUEST = -32600,
    METHOD_NOT_FOUND = -32601,
    INVALID_PARAMS = -32602,
    INTERNAL_ERROR = -32603,
}

export type McpResponse = {
    result: Record<string, unknown>
}

export type McpTool = {
    name: string
    description: string
    inputSchema: Record<string, unknown>
}

export type McpToolResult = {
    text: string
    isError: boolean
    structured: Record<string, unknown> | null
}

export type McpIncomingRequest = {
    id: string | number | null
    method: string
    params: Record<string, unknown>
}
