import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { formErrors } from '../../form-errors'

function toSnakeName(text: string): string {
    const snake = text.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
    if (snake.length === 0) {
        return 'tool'
    }
    return (/^[a-z]/.test(snake) ? snake : `tool_${snake}`).slice(0, MCP_TOOL_NAME_MAX_LENGTH)
}

function uniqueName({ base, taken }: { base: string, taken: string[] }): string {
    if (!taken.includes(base)) {
        return base
    }
    const suffixes = Array.from({ length: taken.length + 1 }, (_, index) => index + 2)
    const free = suffixes.map((suffix) => `${base.slice(0, MCP_TOOL_NAME_MAX_LENGTH - String(suffix).length - 1)}_${suffix}`).find((candidate) => !taken.includes(candidate))
    return free ?? `${base}_${taken.length + 2}`
}

function referencedParams(value: string): string[] {
    return [...value.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((match) => match[1])
}

function nextVersion(releases: McpServiceRelease[]): string {
    const latest = releases[0]
    if (latest === undefined) {
        return '1.0'
    }
    const [major, minor] = latest.version.split('.').map((part) => Number(part) || 0)
    return `${major || 1}.${minor + 1}`
}

function maskKey(key: string): string {
    if (key.length <= 12) {
        return '•'.repeat(key.length)
    }
    return `${key.slice(0, MCP_API_KEY_PREFIX.length + 2)}${'•'.repeat(10)}${key.slice(-4)}`
}

export const mcpServiceUtils = {
    toSnakeName,
    uniqueName,
    referencedParams,
    nextVersion,
    maskKey,
}

export const MCP_SERVICE_MAX_TOOLS = 50
export const MCP_SERVICE_NAME_MAX_LENGTH = 30
export const MCP_SERVICE_KEY_MAX_LENGTH = 40
export const MCP_SERVICE_DESCRIPTION_MAX_LENGTH = 300
export const MCP_TOOL_NAME_MAX_LENGTH = 64
export const MCP_TOOL_TITLE_MAX_LENGTH = 30
export const MCP_TOOL_DESCRIPTION_MAX_LENGTH = 500
export const MCP_TOOL_DESCRIPTION_SHORT_LENGTH = 10
export const MCP_RELEASE_NOTE_MAX_LENGTH = 200
export const MCP_API_KEY_PREFIX = 'mcp_sk_'
export const MCP_API_KEY_RANDOM_LENGTH = 14
export const MCP_TOOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/
export const MCP_TOOL_NAME_STRICT_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
export const MCP_SERVICE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,39}$/

export enum McpServiceStatus {
    DRAFT = 'DRAFT',
    ENABLED = 'ENABLED',
    PAUSED = 'PAUSED',
}

export enum McpToolTriggerKind {
    WEBHOOK = 'WEBHOOK',
    SUBFLOW = 'SUBFLOW',
}

export enum McpToolSourceType {
    WORKFLOW = 'WORKFLOW',
    CONNECTOR_ACTION = 'CONNECTOR_ACTION',
}

export enum McpToolParamMode {
    AI = 'AI',
    FIXED = 'FIXED',
    REFERENCE = 'REFERENCE',
    CLIENT_CONTEXT = 'CLIENT_CONTEXT',
}

export enum McpClientContextKey {
    USER_EMAIL = 'user_email',
    USER_ID = 'user_id',
    USER_NAME = 'user_name',
    CLIENT_NAME = 'client',
}

export enum McpCredentialMode {
    DEVELOPER = 'DEVELOPER',
    CONSUMER = 'CONSUMER',
    USER = 'USER',
}

export enum McpAvailabilityMode {
    ALL = 'ALL',
    MEMBERS = 'MEMBERS',
}

export enum McpServiceListTab {
    ALL = 'ALL',
    MINE = 'MINE',
    OBTAINED = 'OBTAINED',
}

export enum McpServiceIssueLevel {
    ERROR = 'ERROR',
    WARNING = 'WARNING',
}

export enum McpServiceIssueCode {
    NO_TOOLS = 'NO_TOOLS',
    TOOL_NAME_INVALID = 'TOOL_NAME_INVALID',
    TOOL_NAME_DUPLICATE = 'TOOL_NAME_DUPLICATE',
    TOOL_DESCRIPTION_MISSING = 'TOOL_DESCRIPTION_MISSING',
    TOOL_DESCRIPTION_SHORT = 'TOOL_DESCRIPTION_SHORT',
    TOOL_PARAM_INCOMPLETE = 'TOOL_PARAM_INCOMPLETE',
    TOOL_PARAMS_OUT_OF_SYNC = 'TOOL_PARAMS_OUT_OF_SYNC',
    SOURCE_WORKFLOW_MISSING = 'SOURCE_WORKFLOW_MISSING',
    SOURCE_WORKFLOW_NOT_PUBLISHED = 'SOURCE_WORKFLOW_NOT_PUBLISHED',
    SOURCE_WORKFLOW_WRONG_TRIGGER = 'SOURCE_WORKFLOW_WRONG_TRIGGER',
    SOURCE_WORKFLOW_DISABLED = 'SOURCE_WORKFLOW_DISABLED',
    SOURCE_CONNECTOR_MISSING = 'SOURCE_CONNECTOR_MISSING',
    SOURCE_ACTION_MISSING = 'SOURCE_ACTION_MISSING',
    FIXED_CONNECTION_MISSING = 'FIXED_CONNECTION_MISSING',
    FIXED_CONNECTION_NOT_USABLE = 'FIXED_CONNECTION_NOT_USABLE',
    FIXED_CONNECTION_BROKEN = 'FIXED_CONNECTION_BROKEN',
    AVAILABILITY_EMPTY = 'AVAILABILITY_EMPTY',
}

export const McpToolSource = z.discriminatedUnion('type', [
    z.object({
        type: z.literal(McpToolSourceType.WORKFLOW),
        workflowId: z.string(),
    }),
    z.object({
        type: z.literal(McpToolSourceType.CONNECTOR_ACTION),
        connectorName: z.string(),
        actionName: z.string(),
    }),
])
export type McpToolSource = z.infer<typeof McpToolSource>

export const McpToolParam = z.object({
    name: z.string().min(1),
    description: z.string().max(200),
    mode: z.enum(McpToolParamMode),
    hint: z.string().max(200).optional(),
    value: z.string().max(2000).optional(),
    required: z.boolean(),
    valueType: z.enum(['string', 'number', 'boolean', 'object', 'array']),
})
export type McpToolParam = z.infer<typeof McpToolParam>

export const McpServiceTool = z.object({
    id: z.string(),
    name: z.string().regex(MCP_TOOL_NAME_PATTERN, 'mcpToolNameInvalid'),
    title: z.string().max(MCP_TOOL_TITLE_MAX_LENGTH),
    description: z.string().max(MCP_TOOL_DESCRIPTION_MAX_LENGTH),
    source: McpToolSource,
    params: z.array(McpToolParam),
    inputSchema: z.record(z.string(), z.unknown()).optional(),
})
export type McpServiceTool = z.infer<typeof McpServiceTool>

export const McpServiceRelease = z.object({
    version: z.string(),
    publishedAt: z.string(),
    publisherId: Nullable(z.string()),
    publisherName: Nullable(z.string()),
    note: z.string(),
    toolNames: z.array(z.string()),
})
export type McpServiceRelease = z.infer<typeof McpServiceRelease>

export const McpServiceAvailability = z.object({
    mode: z.enum(McpAvailabilityMode),
    userIds: z.array(z.string()),
})
export type McpServiceAvailability = z.infer<typeof McpServiceAvailability>

export const McpService = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    projectDisplayName: Nullable(z.string()),
    key: Nullable(z.string()),
    name: z.string(),
    description: z.string(),
    ownerId: Nullable(z.string()),
    ownerName: Nullable(z.string()),
    status: z.enum(McpServiceStatus),
    draftChanged: z.boolean(),
    listed: z.boolean(),
    tools: z.array(McpServiceTool),
    publishedVersion: Nullable(z.string()),
    releases: z.array(McpServiceRelease),
    credentialMode: z.enum(McpCredentialMode),
    fixedConnections: z.record(z.string(), z.string()),
    availability: McpServiceAvailability,
    lastUsedAt: Nullable(z.string()),
    calls7d: z.number(),
    canEdit: z.boolean(),
    obtained: z.boolean(),
    legacy: z.boolean(),
})
export type McpService = z.infer<typeof McpService>

export const McpServiceMembership = z.object({
    serviceId: z.string(),
    userId: z.string(),
    tokenHint: z.string(),
    connections: z.record(z.string(), z.string()),
    created: z.string(),
})
export type McpServiceMembership = z.infer<typeof McpServiceMembership>

export const McpServiceApiKey = z.object({
    key: z.string(),
    endpointPath: z.string(),
})
export type McpServiceApiKey = z.infer<typeof McpServiceApiKey>

export const ListMcpServicesRequestQuery = z.object({
    projectId: z.string(),
    tab: z.enum(McpServiceListTab).optional(),
    search: z.string().optional(),
})
export type ListMcpServicesRequestQuery = z.infer<typeof ListMcpServicesRequestQuery>

export const CreateMcpServiceRequestBody = z.object({
    projectId: z.string(),
    name: z.string().trim().min(1, formErrors.required).max(MCP_SERVICE_NAME_MAX_LENGTH, 'mcpServiceNameTooLong'),
    key: z.string().trim().min(1, formErrors.required).max(MCP_SERVICE_KEY_MAX_LENGTH, 'mcpServiceKeyTooLong').regex(MCP_SERVICE_KEY_PATTERN, 'mcpServiceKeyInvalid'),
    description: z.string().trim().min(1, formErrors.required).max(MCP_SERVICE_DESCRIPTION_MAX_LENGTH, 'mcpServiceDescriptionTooLong'),
})
export type CreateMcpServiceRequestBody = z.infer<typeof CreateMcpServiceRequestBody>

export const UpdateMcpServiceInfoRequestBody = CreateMcpServiceRequestBody.omit({ projectId: true, key: true })
export type UpdateMcpServiceInfoRequestBody = z.infer<typeof UpdateMcpServiceInfoRequestBody>

export const UpdateMcpServiceToolsRequestBody = z.object({
    tools: z.array(McpServiceTool).max(MCP_SERVICE_MAX_TOOLS),
})
export type UpdateMcpServiceToolsRequestBody = z.infer<typeof UpdateMcpServiceToolsRequestBody>

export const UpdateMcpServiceConnectionsRequestBody = z.object({
    credentialMode: z.enum(McpCredentialMode),
    fixedConnections: z.record(z.string(), z.string()),
})
export type UpdateMcpServiceConnectionsRequestBody = z.infer<typeof UpdateMcpServiceConnectionsRequestBody>

export const UpdateMcpServiceAvailabilityRequestBody = z.object({
    availability: McpServiceAvailability,
}).refine((body) => body.availability.mode === McpAvailabilityMode.ALL || body.availability.userIds.length > 0, {
    message: 'mcpAvailabilityMembersRequired',
    path: ['availability', 'userIds'],
})
export type UpdateMcpServiceAvailabilityRequestBody = z.infer<typeof UpdateMcpServiceAvailabilityRequestBody>

export const PublishMcpServiceRequestBody = z.object({
    note: z.string().trim().min(1, formErrors.required).max(MCP_RELEASE_NOTE_MAX_LENGTH, 'mcpReleaseNoteTooLong'),
})
export type PublishMcpServiceRequestBody = z.infer<typeof PublishMcpServiceRequestBody>

export const SetMcpServiceStatusRequestBody = z.object({
    status: z.enum([McpServiceStatus.ENABLED, McpServiceStatus.PAUSED]),
})
export type SetMcpServiceStatusRequestBody = z.infer<typeof SetMcpServiceStatusRequestBody>

export const SetMcpServiceListedRequestBody = z.object({
    listed: z.boolean(),
})
export type SetMcpServiceListedRequestBody = z.infer<typeof SetMcpServiceListedRequestBody>

export const UpdateMcpServiceMyConnectionsRequestBody = z.object({
    connections: z.record(z.string(), z.string()),
})
export type UpdateMcpServiceMyConnectionsRequestBody = z.infer<typeof UpdateMcpServiceMyConnectionsRequestBody>

export const McpServiceIssue = z.object({
    level: z.enum(McpServiceIssueLevel),
    code: z.enum(McpServiceIssueCode),
    toolId: Nullable(z.string()),
    toolName: Nullable(z.string()),
    connectorName: Nullable(z.string()),
    detail: Nullable(z.string()),
})
export type McpServiceIssue = z.infer<typeof McpServiceIssue>

export const McpServiceIssues = z.object({
    issues: z.array(McpServiceIssue),
    canPublish: z.boolean(),
    nextVersion: z.string(),
})
export type McpServiceIssues = z.infer<typeof McpServiceIssues>

export const McpWorkflowToolCandidate = z.object({
    workflowId: z.string(),
    displayName: z.string(),
    projectId: z.string(),
    triggerKind: Nullable(z.enum(McpToolTriggerKind)),
    published: z.boolean(),
    enabled: z.boolean(),
    respondsWithData: z.boolean(),
    params: z.array(McpToolParam),
})
export type McpWorkflowToolCandidate = z.infer<typeof McpWorkflowToolCandidate>

export const McpConnectorToolParamsQuery = z.object({
    projectId: z.string(),
    connectorName: z.string(),
    actionName: z.string(),
})
export type McpConnectorToolParamsQuery = z.infer<typeof McpConnectorToolParamsQuery>

export const McpToolDebugRequestBody = z.object({
    toolId: z.string(),
    arguments: z.record(z.string(), z.unknown()),
    clientName: z.string().max(100).optional(),
})
export type McpToolDebugRequestBody = z.infer<typeof McpToolDebugRequestBody>

export const McpToolDebugResult = z.object({
    isError: z.boolean(),
    text: z.string(),
    structured: Nullable(z.record(z.string(), z.unknown())),
    resolvedArguments: z.record(z.string(), z.unknown()),
    durationMs: z.number(),
})
export type McpToolDebugResult = z.infer<typeof McpToolDebugResult>

export const TransferMcpServiceRequestBody = z.object({
    ownerId: z.string(),
})
export type TransferMcpServiceRequestBody = z.infer<typeof TransferMcpServiceRequestBody>
