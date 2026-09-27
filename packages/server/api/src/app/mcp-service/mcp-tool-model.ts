import { isNil } from '@fema-ipaas/core-utils'
import {
    MCP_TOOL_DESCRIPTION_SHORT_LENGTH,
    MCP_TOOL_NAME_STRICT_PATTERN,
    McpAvailabilityMode,
    McpClientContextKey,
    McpServiceAvailability,
    McpServiceIssue,
    McpServiceIssueCode,
    McpServiceIssueLevel,
    McpServiceTool,
    mcpServiceUtils,
    McpToolParam,
    McpToolParamMode,
    McpToolSourceType,
} from '@fema-ipaas/shared'
import { z } from 'zod'

function normalizeTools(raw: unknown): McpServiceTool[] {
    if (!Array.isArray(raw)) {
        return []
    }
    return raw.flatMap((candidate) => {
        const tool = normalizeTool(candidate)
        return isNil(tool) ? [] : [tool]
    })
}

function normalizeTool(raw: unknown): McpServiceTool | null {
    const parsed = McpServiceTool.safeParse(raw)
    if (parsed.success) {
        return parsed.data
    }
    const legacy = LegacyTool.safeParse(raw)
    if (!legacy.success) {
        return null
    }
    return {
        id: `legacy-${legacy.data.name}`,
        name: legacy.data.name,
        title: legacy.data.name.slice(0, 30),
        description: legacy.data.description,
        source: { type: McpToolSourceType.WORKFLOW, workflowId: legacy.data.workflowId },
        params: [],
        ...(isNil(legacy.data.inputSchema) ? {} : { inputSchema: legacy.data.inputSchema }),
    }
}

function inputSchemaOf(tool: McpServiceTool): Record<string, unknown> {
    if (tool.params.length === 0) {
        return tool.inputSchema ?? { type: 'object', additionalProperties: true }
    }
    const aiParams = tool.params.filter((param) => param.mode === McpToolParamMode.AI)
    const properties = Object.fromEntries(aiParams.map((param) => [param.name, {
        type: param.valueType,
        description: [param.description, param.hint].filter((text): text is string => !isNil(text) && text.trim().length > 0).join('. '),
    }]))
    const required = aiParams.filter((param) => param.required).map((param) => param.name)
    return {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
    }
}

function resolveArguments({ tool, provided, context }: ResolveArgumentsParams): Record<string, unknown> {
    if (tool.params.length === 0) {
        return provided
    }
    const base = tool.params.reduce<Record<string, unknown>>((acc, param) => {
        switch (param.mode) {
            case McpToolParamMode.AI:
                return param.name in provided ? { ...acc, [param.name]: provided[param.name] } : acc
            case McpToolParamMode.FIXED:
                return { ...acc, [param.name]: coerce({ value: param.value ?? '', valueType: param.valueType }) }
            case McpToolParamMode.CLIENT_CONTEXT:
                return { ...acc, [param.name]: contextValue({ key: param.value, context }) }
            case McpToolParamMode.REFERENCE:
                return acc
        }
        return acc
    }, {})
    return tool.params
        .filter((param) => param.mode === McpToolParamMode.REFERENCE)
        .reduce((acc, param) => ({ ...acc, [param.name]: fillReference({ template: param.value ?? '', values: base, valueType: param.valueType }) }), base)
}

function paramProblem({ param, params }: { param: McpToolParam, params: McpToolParam[] }): string | null {
    const value = (param.value ?? '').trim()
    if (param.mode === McpToolParamMode.FIXED && value.length === 0) {
        return 'FIXED_EMPTY'
    }
    if (param.mode === McpToolParamMode.CLIENT_CONTEXT && !CONTEXT_KEYS.includes(value)) {
        return 'CONTEXT_KEY'
    }
    if (param.mode !== McpToolParamMode.REFERENCE) {
        return null
    }
    const refs = mcpServiceUtils.referencedParams(value)
    if (value.length === 0 || refs.length === 0) {
        return 'REFERENCE_EMPTY'
    }
    if (refs.includes(param.name)) {
        return 'REFERENCE_SELF'
    }
    const byName = new Map(params.map((candidate) => [candidate.name, candidate]))
    if (refs.some((ref) => !byName.has(ref))) {
        return 'REFERENCE_MISSING'
    }
    if (refs.some((ref) => byName.get(ref)?.mode === McpToolParamMode.REFERENCE)) {
        return 'REFERENCE_CHAIN'
    }
    return null
}

function syncParams({ tool, expected }: { tool: McpServiceTool, expected: McpToolParam[] }): { params: McpToolParam[], removed: string[] } {
    const params = expected.map((template) => {
        const current = tool.params.find((param) => param.name === template.name)
        return isNil(current) ? template : { ...current, required: template.required, valueType: template.valueType }
    })
    return { params, removed: tool.params.filter((param) => !expected.some((template) => template.name === param.name)).map((param) => param.name) }
}

function paramsFromProps(props: Record<string, PropLike>): McpToolParam[] {
    return Object.entries(props).flatMap(([name, prop]) => {
        const valueType = VALUE_TYPE_BY_PROPERTY[prop.type]
        if (isNil(valueType)) {
            return []
        }
        return [{
            name,
            description: [prop.displayName, prop.description].filter((text): text is string => !isNil(text) && text.trim().length > 0).join(': ').slice(0, 200),
            mode: McpToolParamMode.AI,
            required: prop.required === true,
            valueType,
        }]
    })
}

function paramsFromSample(sample: unknown): McpToolParam[] {
    const value = typeof sample === 'string' ? safeJson(sample) : sample
    if (typeof value !== 'object' || isNil(value) || Array.isArray(value)) {
        return []
    }
    return Object.entries(value).map(([name, example]) => ({
        name,
        description: '',
        mode: McpToolParamMode.AI,
        required: false,
        valueType: valueTypeOf(example),
    }))
}

function toolIssues({ tools, sourceProblems, expectedParams }: ToolIssuesParams): McpServiceIssue[] {
    const toolLevel = tools.flatMap((tool) => {
        const siblings = tools.filter((other) => other.id !== tool.id).map((other) => other.name)
        const own: McpServiceIssue[] = []
        if (!MCP_TOOL_NAME_STRICT_PATTERN.test(tool.name)) {
            own.push(issue({ level: McpServiceIssueLevel.ERROR, code: McpServiceIssueCode.TOOL_NAME_INVALID, tool }))
        }
        else if (siblings.includes(tool.name)) {
            own.push(issue({ level: McpServiceIssueLevel.ERROR, code: McpServiceIssueCode.TOOL_NAME_DUPLICATE, tool }))
        }
        if (tool.description.trim().length === 0) {
            own.push(issue({ level: McpServiceIssueLevel.ERROR, code: McpServiceIssueCode.TOOL_DESCRIPTION_MISSING, tool }))
        }
        else if (tool.description.trim().length < MCP_TOOL_DESCRIPTION_SHORT_LENGTH) {
            own.push(issue({ level: McpServiceIssueLevel.WARNING, code: McpServiceIssueCode.TOOL_DESCRIPTION_SHORT, tool }))
        }
        const incomplete = tool.params.filter((param) => !isNil(paramProblem({ param, params: tool.params })))
        if (incomplete.length > 0) {
            own.push(issue({ level: McpServiceIssueLevel.ERROR, code: McpServiceIssueCode.TOOL_PARAM_INCOMPLETE, tool, detail: incomplete.map((param) => param.name).join(', ') }))
        }
        const source = sourceProblems.get(tool.id)
        if (!isNil(source)) {
            own.push(issue({ level: source.level, code: source.code, tool }))
        }
        const expected = expectedParams.get(tool.id)
        const outOfSync = !isNil(expected) && tool.params.length > 0 && (expected.length !== tool.params.length || expected.some((param) => !tool.params.some((current) => current.name === param.name)))
        if (outOfSync) {
            own.push(issue({ level: McpServiceIssueLevel.WARNING, code: McpServiceIssueCode.TOOL_PARAMS_OUT_OF_SYNC, tool }))
        }
        return own
    })
    return tools.length === 0
        ? [issue({ level: McpServiceIssueLevel.ERROR, code: McpServiceIssueCode.NO_TOOLS, tool: null })]
        : toolLevel
}

function availabilityIssues(availability: McpServiceAvailability): McpServiceIssue[] {
    return availability.mode === McpAvailabilityMode.MEMBERS && availability.userIds.length === 0
        ? [issue({ level: McpServiceIssueLevel.ERROR, code: McpServiceIssueCode.AVAILABILITY_EMPTY, tool: null })]
        : []
}

function canPublish(issues: McpServiceIssue[]): boolean {
    return !issues.some((candidate) => candidate.level === McpServiceIssueLevel.ERROR)
}

function isCallerAllowed({ availability, userId, ownerId }: { availability: McpServiceAvailability, userId: string, ownerId: string | null }): boolean {
    return availability.mode === McpAvailabilityMode.ALL || userId === ownerId || availability.userIds.includes(userId)
}

function issue({ level, code, tool, detail, connectorName }: IssueParams): McpServiceIssue {
    return {
        level,
        code,
        toolId: tool?.id ?? null,
        toolName: tool?.name ?? null,
        connectorName: connectorName ?? null,
        detail: detail ?? null,
    }
}

function coerce({ value, valueType }: { value: string, valueType: McpToolParam['valueType'] }): unknown {
    switch (valueType) {
        case 'number': {
            const parsed = Number(value)
            return Number.isFinite(parsed) ? parsed : value
        }
        case 'boolean':
            return value.trim().toLowerCase() === 'true'
        case 'object':
        case 'array': {
            const parsed = safeJson(value)
            return isNil(parsed) ? value : parsed
        }
        default:
            return value
    }
}

function fillReference({ template, values, valueType }: { template: string, values: Record<string, unknown>, valueType: McpToolParam['valueType'] }): unknown {
    const whole = /^\{\{\s*([^}\s]+)\s*\}\}$/.exec(template.trim())
    if (!isNil(whole)) {
        return values[whole[1]]
    }
    const text = template.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_match, name: string) => {
        const value = values[name]
        if (isNil(value)) {
            return ''
        }
        return typeof value === 'string' ? value : JSON.stringify(value)
    })
    return valueType === 'string' ? text : coerce({ value: text, valueType })
}

function contextValue({ key, context }: { key: string | undefined, context: McpCallerContext }): string {
    switch (key) {
        case McpClientContextKey.USER_EMAIL:
            return context.userEmail
        case McpClientContextKey.USER_ID:
            return context.userId
        case McpClientContextKey.USER_NAME:
            return context.userName
        case McpClientContextKey.CLIENT_NAME:
            return context.clientName
        default:
            return ''
    }
}

function valueTypeOf(example: unknown): McpToolParam['valueType'] {
    if (Array.isArray(example)) {
        return 'array'
    }
    if (typeof example === 'number') {
        return 'number'
    }
    if (typeof example === 'boolean') {
        return 'boolean'
    }
    if (typeof example === 'object' && !isNil(example)) {
        return 'object'
    }
    return 'string'
}

function safeJson(text: string): unknown {
    try {
        const value: unknown = JSON.parse(text)
        return value
    }
    catch {
        return null
    }
}

export const mcpToolModel = {
    normalizeTools,
    normalizeTool,
    inputSchemaOf,
    resolveArguments,
    paramProblem,
    syncParams,
    paramsFromProps,
    paramsFromSample,
    toolIssues,
    availabilityIssues,
    canPublish,
    isCallerAllowed,
    issue,
}

const CONTEXT_KEYS: string[] = Object.values(McpClientContextKey)

const VALUE_TYPE_BY_PROPERTY: Record<string, McpToolParam['valueType'] | undefined> = {
    SHORT_TEXT: 'string',
    LONG_TEXT: 'string',
    RICH_TEXT: 'string',
    DROPDOWN: 'string',
    STATIC_DROPDOWN: 'string',
    DATE_TIME: 'string',
    FILE: 'string',
    COLOR: 'string',
    SECRET_TEXT: 'string',
    NUMBER: 'number',
    CHECKBOX: 'boolean',
    OBJECT: 'object',
    JSON: 'object',
    DYNAMIC: 'object',
    DATE_RANGE: 'object',
    ARRAY: 'array',
    MULTI_SELECT_DROPDOWN: 'array',
    STATIC_MULTI_SELECT_DROPDOWN: 'array',
}

const LegacyTool = z.object({
    workflowId: z.string(),
    name: z.string(),
    description: z.string(),
    inputSchema: z.record(z.string(), z.unknown()).optional(),
})

type ResolveArgumentsParams = {
    tool: McpServiceTool
    provided: Record<string, unknown>
    context: McpCallerContext
}

type ToolIssuesParams = {
    tools: McpServiceTool[]
    sourceProblems: Map<string, { level: McpServiceIssueLevel, code: McpServiceIssueCode }>
    expectedParams: Map<string, McpToolParam[]>
}

type IssueParams = {
    level: McpServiceIssueLevel
    code: McpServiceIssueCode
    tool: Pick<McpServiceTool, 'id' | 'name'> | null
    detail?: string
    connectorName?: string
}

export type PropLike = {
    type: string
    displayName?: string
    description?: string
    required?: boolean
}

export type McpCallerContext = {
    userEmail: string
    userId: string
    userName: string
    clientName: string
}
