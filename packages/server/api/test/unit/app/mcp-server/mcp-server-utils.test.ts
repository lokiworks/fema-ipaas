import { McpServerProbeResult, McpServerUrlIssue, mcpServerUtils } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'

describe('mcpServerUtils.validateUrl', () => {
    it.each([
        ['', McpServerUrlIssue.EMPTY],
        ['ftp://mcp.corp.com', McpServerUrlIssue.SCHEME],
        ['mcp.corp.com/mcp', McpServerUrlIssue.SCHEME],
        ['https://mcp.corp.com/m cp', McpServerUrlIssue.WHITESPACE],
        ['https://mcp.corp.com/mcp#tools', McpServerUrlIssue.FRAGMENT],
        ['https://user:pass@mcp.corp.com/mcp', McpServerUrlIssue.CREDENTIALS],
        ['https://mcp.corp.com:0/mcp', McpServerUrlIssue.PORT],
        ['https://mcp.corp.com:70000/mcp', McpServerUrlIssue.PORT],
        ['https://mcp.corp.com:/mcp', McpServerUrlIssue.PORT],
    ])('rejects %s', (url, issue) => {
        expect(mcpServerUtils.validateUrl(url)).toBe(issue)
    })

    it.each([
        'https://mcp.corp.com/mcp',
        'http://10.2.3.14:8080/sse',
        'https://[2001:db8::1]:8443/mcp',
        ' https://kb.corp.com/mcp?team=it ',
    ])('accepts %s', (url) => {
        expect(mcpServerUtils.validateUrl(url)).toBeNull()
    })

    it('shows the host for messages', () => {
        expect(mcpServerUtils.hostOf('https://mcp.corp.com:8443/mcp')).toBe('mcp.corp.com:8443')
    })
})

describe('mcpServerUtils.isWriteLikeTool', () => {
    it('trusts the read-only hint of the server first', () => {
        expect(mcpServerUtils.isWriteLikeTool({ name: 'create_issue', readOnly: true })).toBe(false)
        expect(mcpServerUtils.isWriteLikeTool({ name: 'search', readOnly: false })).toBe(true)
    })

    it('falls back to the tool name', () => {
        expect(mcpServerUtils.isWriteLikeTool({ name: 'create_followup' })).toBe(true)
        expect(mcpServerUtils.isWriteLikeTool({ name: 'search_pages' })).toBe(false)
    })
})

describe('McpServerProbeResult', () => {
    it('reads the output of the connector test action', () => {
        const parsed = McpServerProbeResult.safeParse({ ok: false, error: { failure: 'PRIVATE_UNREACHABLE', detail: 'timeout', host: '10.0.0.5' } })
        expect(parsed.success).toBe(true)
        expect(McpServerProbeResult.safeParse({ ok: true, tools: [{ name: 'a', description: '', inputSchema: {} }], latencyMs: 12, insecureHttp: false }).success).toBe(true)
    })
})
