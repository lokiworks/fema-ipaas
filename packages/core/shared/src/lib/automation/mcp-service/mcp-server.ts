import { Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { formErrors } from '../../form-errors'
import { ConnectionPermission, ConnectionProjectRef } from '../connection/connection-share'
import { ConnectionStatus } from '../connection/connection'

function validateUrl(value: string): McpServerUrlIssue | null {
    const text = value.trim()
    if (text.length === 0) {
        return McpServerUrlIssue.EMPTY
    }
    if (!/^https?:\/\//i.test(text)) {
        return McpServerUrlIssue.SCHEME
    }
    if (/\s/.test(text)) {
        return McpServerUrlIssue.WHITESPACE
    }
    if (text.includes('#')) {
        return McpServerUrlIssue.FRAGMENT
    }
    const authority = text.replace(/^https?:\/\//i, '').split(/[/?]/)[0]
    if (authority.includes('@')) {
        return McpServerUrlIssue.CREDENTIALS
    }
    const portMatch = /:(\d*)$/.exec(authority.replace(/^\[[^\]]*\]/, ''))
    if (portMatch !== null) {
        const port = Number(portMatch[1])
        if (portMatch[1].length === 0 || !Number.isInteger(port) || port < 1 || port > 65535) {
            return McpServerUrlIssue.PORT
        }
    }
    const parsed = parseUrl(text)
    if (parsed === null || parsed.hostname.length === 0) {
        return McpServerUrlIssue.INVALID
    }
    return null
}

function hostOf(value: string): string {
    return parseUrl(value.trim())?.host ?? value.trim()
}

function isWriteLikeTool({ name, readOnly }: { name: string, readOnly?: boolean }): boolean {
    if (readOnly === true) {
        return false
    }
    if (readOnly === false) {
        return true
    }
    return WRITE_LIKE_TOOL_PATTERN.test(name)
}

function parseUrl(value: string): URL | null {
    try {
        return new URL(value)
    }
    catch {
        return null
    }
}

export const mcpServerUtils = {
    validateUrl,
    hostOf,
    isWriteLikeTool,
}

export const MCP_SERVER_NAME_MAX_LENGTH = 30
export const MCP_SERVER_DESCRIPTION_MAX_LENGTH = 200

const WRITE_LIKE_TOOL_PATTERN = /^(create|update|delete|remove|send|submit|post|add|set|save|write|put|patch|insert|upsert|cancel|approve|reject|close|merge|move|archive|publish|invite|assign|transfer|pay|refund|run|execute|trigger)/i

export enum McpServerTransport {
    STREAMABLE_HTTP = 'streamable_http',
    SSE = 'sse',
}

export enum McpServerAuthType {
    NONE = 'none',
    BEARER = 'bearer',
    OAUTH2 = 'oauth2',
}

export enum McpServerUrlIssue {
    EMPTY = 'EMPTY',
    SCHEME = 'SCHEME',
    WHITESPACE = 'WHITESPACE',
    FRAGMENT = 'FRAGMENT',
    CREDENTIALS = 'CREDENTIALS',
    PORT = 'PORT',
    INVALID = 'INVALID',
}

export enum McpServerProbeFailure {
    INVALID_URL = 'INVALID_URL',
    LOOPBACK = 'LOOPBACK',
    LINK_LOCAL = 'LINK_LOCAL',
    PRIVATE_UNREACHABLE = 'PRIVATE_UNREACHABLE',
    DNS = 'DNS',
    TRANSPORT_MISMATCH = 'TRANSPORT_MISMATCH',
    UNAUTHORIZED = 'UNAUTHORIZED',
    OAUTH_NOT_AUTHORIZED = 'OAUTH_NOT_AUTHORIZED',
    TIMEOUT = 'TIMEOUT',
    UNREACHABLE = 'UNREACHABLE',
    PROTOCOL = 'PROTOCOL',
    WORKER_UNAVAILABLE = 'WORKER_UNAVAILABLE',
}

export enum McpServerStatus {
    CONNECTED = 'CONNECTED',
    ERROR = 'ERROR',
}

export const McpServerTool = z.object({
    name: z.string(),
    title: z.string().optional(),
    description: z.string(),
    inputSchema: z.record(z.string(), z.unknown()),
    readOnly: z.boolean().optional(),
})
export type McpServerTool = z.infer<typeof McpServerTool>

export const McpServerProbeError = z.object({
    failure: z.enum(McpServerProbeFailure),
    detail: z.string(),
    host: z.string(),
})
export type McpServerProbeError = z.infer<typeof McpServerProbeError>

export const McpServerProbeResult = z.discriminatedUnion('ok', [
    z.object({
        ok: z.literal(true),
        tools: z.array(McpServerTool),
        latencyMs: z.number(),
        insecureHttp: z.boolean(),
    }),
    z.object({
        ok: z.literal(false),
        error: McpServerProbeError,
    }),
])
export type McpServerProbeResult = z.infer<typeof McpServerProbeResult>

const McpServerConnectionFields = {
    url: z.string().trim().min(1, formErrors.required).refine((value) => validateUrl(value) === null, { message: 'mcpServerUrlInvalid' }),
    transport: z.enum(McpServerTransport),
}

export const McpServerAuthInput = z.discriminatedUnion('type', [
    z.object({ type: z.literal(McpServerAuthType.NONE) }),
    z.object({ type: z.literal(McpServerAuthType.BEARER), token: z.string().optional() }),
    z.object({
        type: z.literal(McpServerAuthType.OAUTH2),
        authUrl: z.string().optional(),
        tokenUrl: z.string().optional(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        scope: z.string().optional(),
        code: z.string().optional(),
        codeVerifier: z.string().optional(),
        redirectUrl: z.string().optional(),
    }),
])
export type McpServerAuthInput = z.infer<typeof McpServerAuthInput>

export const TestMcpServerRequestBody = z.object({
    projectId: z.string(),
    serverId: z.string().optional(),
    ...McpServerConnectionFields,
    auth: McpServerAuthInput,
})
export type TestMcpServerRequestBody = z.infer<typeof TestMcpServerRequestBody>

export const UpsertMcpServerRequestBody = z.object({
    projectId: z.string(),
    displayName: z.string().trim().min(1, formErrors.required).max(MCP_SERVER_NAME_MAX_LENGTH, 'mcpServerNameTooLong'),
    description: z.string().trim().max(MCP_SERVER_DESCRIPTION_MAX_LENGTH, 'mcpServerDescriptionTooLong'),
    ...McpServerConnectionFields,
    auth: McpServerAuthInput,
    allProjects: z.boolean(),
    projectIds: z.array(z.string()),
    saveWithoutPassingTest: z.boolean().optional(),
}).refine((body) => body.allProjects || body.projectIds.length > 0, {
    message: 'connectionScopeProjectRequired',
    path: ['projectIds'],
})
export type UpsertMcpServerRequestBody = z.infer<typeof UpsertMcpServerRequestBody>

export const McpServer = z.object({
    id: z.string(),
    connectionId: z.string(),
    externalId: z.string(),
    created: z.string(),
    updated: z.string(),
    displayName: z.string(),
    description: z.string(),
    url: z.string(),
    transport: z.enum(McpServerTransport),
    authType: z.enum(McpServerAuthType),
    authConfigured: z.boolean(),
    status: z.enum(McpServerStatus),
    connectionStatus: z.enum(ConnectionStatus),
    lastError: Nullable(McpServerProbeError),
    tools: z.array(McpServerTool),
    lastSyncedAt: Nullable(z.string()),
    allProjects: z.boolean(),
    projectIds: z.array(z.string()),
    projects: z.array(ConnectionProjectRef),
    ownerId: Nullable(z.string()),
    ownerName: Nullable(z.string()),
    myPermission: Nullable(z.enum(ConnectionPermission)),
    canManage: z.boolean(),
})
export type McpServer = z.infer<typeof McpServer>

export const ListMcpServersRequestQuery = z.object({
    projectId: z.string(),
    search: z.string().optional(),
})
export type ListMcpServersRequestQuery = z.infer<typeof ListMcpServersRequestQuery>

export const McpServerSaveResponse = z.object({
    server: McpServer,
    probe: Nullable(McpServerProbeResult),
})
export type McpServerSaveResponse = z.infer<typeof McpServerSaveResponse>

export const SyncMcpServerToolsResponse = z.object({
    server: McpServer,
    probe: McpServerProbeResult,
    added: z.array(z.string()),
    removed: z.array(z.string()),
    removedInUse: z.array(z.string()),
})
export type SyncMcpServerToolsResponse = z.infer<typeof SyncMcpServerToolsResponse>

export const TryMcpServerToolRequestBody = z.object({
    projectId: z.string(),
    toolName: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()),
})
export type TryMcpServerToolRequestBody = z.infer<typeof TryMcpServerToolRequestBody>

export const McpServerToolTrialResult = z.object({
    ok: z.boolean(),
    isError: z.boolean(),
    text: z.string(),
    structured: Nullable(z.record(z.string(), z.unknown())),
    errorMessage: Nullable(z.string()),
    durationMs: z.number(),
})
export type McpServerToolTrialResult = z.infer<typeof McpServerToolTrialResult>

export enum McpServerUsageKind {
    STEP = 'STEP',
    AGENT = 'AGENT',
}

export const McpServerUsageItem = z.object({
    stepName: z.string(),
    stepDisplayName: z.string(),
    kind: z.enum(McpServerUsageKind),
    toolName: Nullable(z.string()),
})
export type McpServerUsageItem = z.infer<typeof McpServerUsageItem>

export const McpServerWorkflowUsage = z.object({
    workflowId: z.string(),
    displayName: z.string(),
    projectId: z.string(),
    projectDisplayName: z.string(),
    items: z.array(McpServerUsageItem),
})
export type McpServerWorkflowUsage = z.infer<typeof McpServerWorkflowUsage>

export const McpServerUsage = z.object({
    workflows: z.array(McpServerWorkflowUsage),
    hiddenWorkflowCount: z.number(),
})
export type McpServerUsage = z.infer<typeof McpServerUsage>
