import { agentMcpServers, AgentMcpServerInfo, AgentMcpServerProblemCode } from '../src/lib/agent-mcp-servers'

const hr: AgentMcpServerInfo = {
    externalId: 'mcp-server-hr',
    displayName: '企业人事工具',
    url: 'https://hr.corp/mcp',
    authType: 'bearer',
    ok: true,
    toolNames: ['query_employee', 'create_ticket'],
}
const open: AgentMcpServerInfo = {
    externalId: 'mcp-server-open',
    displayName: '开放服务',
    url: 'https://open.corp/mcp',
    authType: 'none',
    ok: true,
    toolNames: ['ping'],
}

describe('agentMcpServers.authorizationOf', () => {
    test('writes the reference of the token for each authentication type', () => {
        expect(agentMcpServers.authorizationOf({ authType: 'bearer', externalId: 'x' })).toBe("{{connections['x'].props.token}}")
        expect(agentMcpServers.authorizationOf({ authType: 'oauth2', externalId: 'x' })).toBe("{{connections['x'].access_token}}")
        expect(agentMcpServers.authorizationOf({ authType: 'none', externalId: 'x' })).toBe('')
    })
})

describe('agentMcpServers.read', () => {
    test('reads entries tolerantly and drops what is not an object', () => {
        expect(agentMcpServers.read([{ url: ' https://a/mcp ', authorization: 'Bearer x', server: ' s1 ' }, 'oops', null, { url: 5 }, { url: 'https://b/mcp' }])).toEqual([
            { server: 's1', url: 'https://a/mcp', authorization: 'Bearer x' },
            { server: null, url: '', authorization: '' },
            { server: null, url: 'https://b/mcp', authorization: '' },
        ])
        expect(agentMcpServers.read(undefined)).toEqual([])
        expect(agentMcpServers.read('x')).toEqual([])
    })

    test('reads tool names, accepting numbers and skipping blanks', () => {
        expect(agentMcpServers.readNames([' a ', 3, '', null, {}])).toEqual(['a', '3'])
    })
})

describe('agentMcpServers.externalIdOf', () => {
    test('prefers the server the picker wrote, then the connection reference, then the address', () => {
        const servers = [hr, open]
        expect(agentMcpServers.externalIdOf({ entry: agentMcpServers.entryOf({ server: hr }), servers })).toBe('mcp-server-hr')
        expect(agentMcpServers.externalIdOf({ entry: { server: null, url: 'https://old/mcp', authorization: "{{connections['mcp-server-hr'].props.token}}" }, servers })).toBe('mcp-server-hr')
        expect(agentMcpServers.externalIdOf({ entry: { server: null, url: 'https://open.corp/mcp', authorization: '' }, servers })).toBe('mcp-server-open')
        expect(agentMcpServers.externalIdOf({ entry: { server: null, url: 'https://unknown/mcp', authorization: 'Bearer abc' }, servers })).toBeNull()
    })
})

describe('agentMcpServers.inspect', () => {
    test('is quiet when every picked server is there and healthy', () => {
        expect(agentMcpServers.inspect({ entries: [agentMcpServers.entryOf({ server: hr })], servers: [hr], allowedTools: ['query_employee'] })).toEqual([])
    })

    test('reports a deleted server by the id the step still points at', () => {
        const problems = agentMcpServers.inspect({ entries: [agentMcpServers.entryOf({ server: hr })], servers: [open], allowedTools: [] })
        expect(problems).toEqual([{ code: AgentMcpServerProblemCode.SERVER_MISSING, entryIndex: 0, server: 'mcp-server-hr', tool: null }])
    })

    test('reports a server that cannot be reached by its name', () => {
        const problems = agentMcpServers.inspect({ entries: [agentMcpServers.entryOf({ server: hr })], servers: [{ ...hr, ok: false }], allowedTools: [] })
        expect(problems).toEqual([{ code: AgentMcpServerProblemCode.SERVER_BROKEN, entryIndex: 0, server: '企业人事工具', tool: null }])
    })

    test('reports an allowed tool the server no longer offers', () => {
        const problems = agentMcpServers.inspect({ entries: [agentMcpServers.entryOf({ server: hr })], servers: [hr], allowedTools: ['query_employee', 'drop_table'] })
        expect(problems).toEqual([{ code: AgentMcpServerProblemCode.TOOL_MISSING, entryIndex: -1, server: '', tool: 'drop_table' }])
    })

    test('accepts the serverN_ alias the agent uses for tool names shared by two servers', () => {
        const problems = agentMcpServers.inspect({ entries: [agentMcpServers.entryOf({ server: hr })], servers: [hr], allowedTools: ['server1_query_employee'] })
        expect(problems).toEqual([])
    })

    test('does not guess about tools when a hand-written address is also listed', () => {
        const problems = agentMcpServers.inspect({
            entries: [agentMcpServers.entryOf({ server: hr }), { server: null, url: 'https://external/mcp', authorization: '' }],
            servers: [hr],
            allowedTools: ['something_from_the_manual_server'],
        })
        expect(problems).toEqual([])
    })

    test('leaves tool problems out while a server problem already explains them', () => {
        const problems = agentMcpServers.inspect({ entries: [agentMcpServers.entryOf({ server: hr })], servers: [], allowedTools: ['query_employee'] })
        expect(problems.map((problem) => problem.code)).toEqual([AgentMcpServerProblemCode.SERVER_MISSING])
    })

    test('treats an entry without any link to a known server as a hand-written address', () => {
        expect(agentMcpServers.inspect({ entries: [{ server: null, url: 'https://x/mcp', authorization: 'Bearer abc' }], servers: [hr], allowedTools: [] })).toEqual([])
    })
})
