import { McpAvailabilityMode, McpClientContextKey, McpServiceIssueCode, McpServiceIssueLevel, McpServiceTool, mcpServiceUtils, McpToolParamMode, McpToolSourceType } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { mcpToolModel } from '../../../../src/app/mcp-service/mcp-tool-model'

const context = { userEmail: 'li@corp.com', userId: 'u1', userName: 'Li Hang', clientName: 'Cursor' }

function tool(overrides: Partial<McpServiceTool> = {}): McpServiceTool {
    return {
        id: 't1',
        name: 'create_ticket',
        title: 'Create ticket',
        description: 'Create a support ticket for the caller',
        source: { type: McpToolSourceType.CONNECTOR_ACTION, connectorName: '@fema-ipaas/connector-jira', actionName: 'create_issue' },
        params: [],
        ...overrides,
    }
}

describe('mcpToolModel.normalizeTools', () => {
    it('upgrades legacy webhook tools', () => {
        const [legacy] = mcpToolModel.normalizeTools([{ workflowId: 'wf1', name: 'lookup', description: 'Look it up', inputSchema: { type: 'object' } }])
        expect(legacy).toEqual({
            id: 'legacy-lookup',
            name: 'lookup',
            title: 'lookup',
            description: 'Look it up',
            source: { type: McpToolSourceType.WORKFLOW, workflowId: 'wf1' },
            params: [],
            inputSchema: { type: 'object' },
        })
    })

    it('drops rows it cannot read', () => {
        expect(mcpToolModel.normalizeTools([{ nonsense: true }, 42])).toEqual([])
        expect(mcpToolModel.normalizeTools(null)).toEqual([])
    })
})

describe('mcpToolModel.inputSchemaOf', () => {
    it('only exposes AI-inferred params to the model', () => {
        const schema = mcpToolModel.inputSchemaOf(tool({
            params: [
                { name: 'summary', description: 'Title', mode: McpToolParamMode.AI, hint: 'One line', required: true, valueType: 'string' },
                { name: 'project', description: 'Project', mode: McpToolParamMode.FIXED, value: 'IT', required: true, valueType: 'string' },
                { name: 'reporter', description: 'Reporter', mode: McpToolParamMode.CLIENT_CONTEXT, value: McpClientContextKey.USER_EMAIL, required: false, valueType: 'string' },
            ],
        }))
        expect(schema).toEqual({
            type: 'object',
            properties: { summary: { type: 'string', description: 'Title. One line' } },
            required: ['summary'],
            additionalProperties: false,
        })
    })

    it('keeps the stored schema of legacy tools', () => {
        expect(mcpToolModel.inputSchemaOf(tool({ inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }))).toEqual({ type: 'object', properties: { q: { type: 'string' } } })
    })
})

describe('mcpToolModel.resolveArguments', () => {
    it('merges AI, fixed, context and reference values', () => {
        const resolved = mcpToolModel.resolveArguments({
            tool: tool({
                params: [
                    { name: 'summary', description: '', mode: McpToolParamMode.AI, required: true, valueType: 'string' },
                    { name: 'priority', description: '', mode: McpToolParamMode.FIXED, value: '3', required: false, valueType: 'number' },
                    { name: 'urgent', description: '', mode: McpToolParamMode.FIXED, value: 'true', required: false, valueType: 'boolean' },
                    { name: 'reporter', description: '', mode: McpToolParamMode.CLIENT_CONTEXT, value: McpClientContextKey.USER_EMAIL, required: false, valueType: 'string' },
                    { name: 'client', description: '', mode: McpToolParamMode.CLIENT_CONTEXT, value: McpClientContextKey.CLIENT_NAME, required: false, valueType: 'string' },
                    { name: 'title', description: '', mode: McpToolParamMode.REFERENCE, value: '[{{reporter}}] {{summary}}', required: false, valueType: 'string' },
                    { name: 'copy', description: '', mode: McpToolParamMode.REFERENCE, value: '{{priority}}', required: false, valueType: 'number' },
                ],
            }),
            provided: { summary: 'Printer broken', injected: 'ignored' },
            context,
        })
        expect(resolved).toEqual({
            summary: 'Printer broken',
            priority: 3,
            urgent: true,
            reporter: 'li@corp.com',
            client: 'Cursor',
            title: '[li@corp.com] Printer broken',
            copy: 3,
        })
    })

    it('passes arguments through for tools without params', () => {
        expect(mcpToolModel.resolveArguments({ tool: tool(), provided: { a: 1 }, context })).toEqual({ a: 1 })
    })
})

describe('mcpToolModel.paramProblem', () => {
    const summary = { name: 'summary', description: '', mode: McpToolParamMode.AI, required: true, valueType: 'string' as const }

    it('flags incomplete fixed values and broken references', () => {
        expect(mcpToolModel.paramProblem({ param: { ...summary, mode: McpToolParamMode.FIXED, value: ' ' }, params: [] })).toBe('FIXED_EMPTY')
        expect(mcpToolModel.paramProblem({ param: { ...summary, name: 'x', mode: McpToolParamMode.REFERENCE, value: 'plain' }, params: [summary] })).toBe('REFERENCE_EMPTY')
        expect(mcpToolModel.paramProblem({ param: { ...summary, name: 'x', mode: McpToolParamMode.REFERENCE, value: '{{x}}' }, params: [summary] })).toBe('REFERENCE_SELF')
        expect(mcpToolModel.paramProblem({ param: { ...summary, name: 'x', mode: McpToolParamMode.REFERENCE, value: '{{nope}}' }, params: [summary] })).toBe('REFERENCE_MISSING')
        const chained = { ...summary, name: 'y', mode: McpToolParamMode.REFERENCE, value: '{{summary}}' }
        expect(mcpToolModel.paramProblem({ param: { ...summary, name: 'x', mode: McpToolParamMode.REFERENCE, value: '{{y}}' }, params: [summary, chained] })).toBe('REFERENCE_CHAIN')
        expect(mcpToolModel.paramProblem({ param: chained, params: [summary, chained] })).toBeNull()
        expect(mcpToolModel.paramProblem({ param: { ...summary, mode: McpToolParamMode.CLIENT_CONTEXT, value: 'phone' }, params: [] })).toBe('CONTEXT_KEY')
    })
})

describe('mcpToolModel.toolIssues', () => {
    it('blocks publishing without tools', () => {
        const issues = mcpToolModel.toolIssues({ tools: [], sourceProblems: new Map(), expectedParams: new Map() })
        expect(issues.map((issue) => issue.code)).toEqual([McpServiceIssueCode.NO_TOOLS])
        expect(mcpToolModel.canPublish(issues)).toBe(false)
    })

    it('reports naming, description, duplicate and source problems', () => {
        const tools = [
            tool({ id: 'a', name: 'Bad-Name', description: '' }),
            tool({ id: 'b', name: 'dup', description: 'short' }),
            tool({ id: 'c', name: 'dup' }),
        ]
        const issues = mcpToolModel.toolIssues({
            tools,
            sourceProblems: new Map([['c', { level: McpServiceIssueLevel.ERROR, code: McpServiceIssueCode.SOURCE_ACTION_MISSING }]]),
            expectedParams: new Map(),
        })
        expect(issues.map((issue) => [issue.toolId, issue.code])).toEqual([
            ['a', McpServiceIssueCode.TOOL_NAME_INVALID],
            ['a', McpServiceIssueCode.TOOL_DESCRIPTION_MISSING],
            ['b', McpServiceIssueCode.TOOL_NAME_DUPLICATE],
            ['b', McpServiceIssueCode.TOOL_DESCRIPTION_SHORT],
            ['c', McpServiceIssueCode.TOOL_NAME_DUPLICATE],
            ['c', McpServiceIssueCode.SOURCE_ACTION_MISSING],
        ])
    })

    it('warns when params drift from the source', () => {
        const drifted = tool({ params: [{ name: 'old', description: '', mode: McpToolParamMode.AI, required: false, valueType: 'string' }] })
        const issues = mcpToolModel.toolIssues({
            tools: [drifted],
            sourceProblems: new Map(),
            expectedParams: new Map([['t1', [{ name: 'new', description: '', mode: McpToolParamMode.AI, required: true, valueType: 'string' }]]]),
        })
        expect(issues).toEqual([expect.objectContaining({ code: McpServiceIssueCode.TOOL_PARAMS_OUT_OF_SYNC, level: McpServiceIssueLevel.WARNING })])
        expect(mcpToolModel.canPublish(issues)).toBe(true)
    })
})

describe('mcpToolModel params from sources', () => {
    it('maps connector props to typed params and skips display-only props', () => {
        expect(mcpToolModel.paramsFromProps({
            title: { type: 'SHORT_TEXT', displayName: 'Title', required: true },
            count: { type: 'NUMBER', displayName: 'Count' },
            notes: { type: 'MARKDOWN', displayName: 'Read me' },
            labels: { type: 'ARRAY', displayName: 'Labels' },
        })).toEqual([
            { name: 'title', description: 'Title', mode: McpToolParamMode.AI, required: true, valueType: 'string' },
            { name: 'count', description: 'Count', mode: McpToolParamMode.AI, required: false, valueType: 'number' },
            { name: 'labels', description: 'Labels', mode: McpToolParamMode.AI, required: false, valueType: 'array' },
        ])
    })

    it('reads subflow sample data', () => {
        expect(mcpToolModel.paramsFromSample('{"employeeId":"E1","days":3,"tags":["a"]}').map((param) => [param.name, param.valueType])).toEqual([
            ['employeeId', 'string'],
            ['days', 'number'],
            ['tags', 'array'],
        ])
        expect(mcpToolModel.paramsFromSample(undefined)).toEqual([])
    })

    it('keeps modes when syncing params and lists removed ones', () => {
        const current = tool({ params: [
            { name: 'a', description: 'mine', mode: McpToolParamMode.FIXED, value: 'x', required: false, valueType: 'string' },
            { name: 'gone', description: '', mode: McpToolParamMode.AI, required: false, valueType: 'string' },
        ] })
        const synced = mcpToolModel.syncParams({ tool: current, expected: [
            { name: 'a', description: '', mode: McpToolParamMode.AI, required: true, valueType: 'string' },
            { name: 'b', description: 'new', mode: McpToolParamMode.AI, required: false, valueType: 'number' },
        ] })
        expect(synced.removed).toEqual(['gone'])
        expect(synced.params.map((param) => [param.name, param.mode, param.required])).toEqual([['a', McpToolParamMode.FIXED, true], ['b', McpToolParamMode.AI, false]])
    })
})

describe('availability and helpers', () => {
    it('lets everyone, listed members and the owner call', () => {
        expect(mcpToolModel.isCallerAllowed({ availability: { mode: McpAvailabilityMode.ALL, userIds: [] }, userId: 'x', ownerId: 'o' })).toBe(true)
        expect(mcpToolModel.isCallerAllowed({ availability: { mode: McpAvailabilityMode.MEMBERS, userIds: ['m'] }, userId: 'm', ownerId: 'o' })).toBe(true)
        expect(mcpToolModel.isCallerAllowed({ availability: { mode: McpAvailabilityMode.MEMBERS, userIds: ['m'] }, userId: 'o', ownerId: 'o' })).toBe(true)
        expect(mcpToolModel.isCallerAllowed({ availability: { mode: McpAvailabilityMode.MEMBERS, userIds: ['m'] }, userId: 'x', ownerId: 'o' })).toBe(false)
        expect(mcpToolModel.availabilityIssues({ mode: McpAvailabilityMode.MEMBERS, userIds: [] })[0]?.code).toBe(McpServiceIssueCode.AVAILABILITY_EMPTY)
    })

    it('builds snake names, versions and masks keys', () => {
        expect(mcpServiceUtils.toSnakeName('Jira · Create Issue')).toBe('jira_create_issue')
        expect(mcpServiceUtils.toSnakeName('123 go')).toBe('tool_123_go')
        expect(mcpServiceUtils.uniqueName({ base: 'run', taken: ['run', 'run_2'] })).toBe('run_3')
        expect(mcpServiceUtils.nextVersion([])).toBe('1.0')
        expect(mcpServiceUtils.nextVersion([{ version: '1.4', publishedAt: '', publisherId: null, publisherName: null, note: '', toolNames: [] }])).toBe('1.5')
        expect(mcpServiceUtils.maskKey('mcp_sk_ABCDEFGHJKLMNP')).toBe('mcp_sk_AB••••••••••LMNP')
    })
})
