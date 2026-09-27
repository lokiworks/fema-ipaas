import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { formErrors } from '../../form-errors'

export const MCP_SERVICE_MAX_TOOLS = 50
export const MCP_TOOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/

export enum McpToolTriggerKind {
    WEBHOOK = 'WEBHOOK',
}

export const McpServiceTool = z.object({
    workflowId: z.string(),
    name: z.string().regex(MCP_TOOL_NAME_PATTERN, 'mcpToolNameInvalid'),
    description: z.string().trim().min(1, formErrors.required).max(1000),
    inputSchema: z.record(z.string(), z.unknown()).optional(),
})
export type McpServiceTool = z.infer<typeof McpServiceTool>

export const McpService = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    name: z.string(),
    description: z.string(),
    enabled: z.boolean(),
    tools: z.array(McpServiceTool),
    tokenHint: z.string(),
    lastUsedAt: Nullable(z.string()),
})
export type McpService = z.infer<typeof McpService>

export const UpsertMcpServiceRequestBody = z.object({
    projectId: z.string(),
    name: z.string().trim().min(1, formErrors.required).max(100),
    description: z.string().max(1000),
    enabled: z.boolean(),
    tools: z.array(McpServiceTool).max(MCP_SERVICE_MAX_TOOLS).superRefine((tools, ctx) => {
        const seen = new Set<string>()
        tools.forEach((tool, index) => {
            if (seen.has(tool.name)) {
                ctx.addIssue({ code: 'custom', message: 'mcpToolNameDuplicate', path: [index, 'name'] })
            }
            seen.add(tool.name)
        })
    }),
})
export type UpsertMcpServiceRequestBody = z.infer<typeof UpsertMcpServiceRequestBody>

export const McpServiceWithToken = McpService.extend({
    token: z.string(),
})
export type McpServiceWithToken = z.infer<typeof McpServiceWithToken>

export const McpToolCandidate = z.object({
    workflowId: z.string(),
    displayName: z.string(),
    triggerKind: z.enum(McpToolTriggerKind),
    enabled: z.boolean(),
    respondsWithData: z.boolean(),
})
export type McpToolCandidate = z.infer<typeof McpToolCandidate>
