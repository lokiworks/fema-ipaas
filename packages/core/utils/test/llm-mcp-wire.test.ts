import { describe, expect, it } from 'vitest'
import { LlmProvider, llmWire } from '../src/lib/llm-wire'
import { mcpWire } from '../src/lib/mcp-wire'

describe('llmWire.buildRequest', () => {
    it('builds an Anthropic messages request with tools and tool results', () => {
        const request = llmWire.buildRequest({
            config: { provider: LlmProvider.ANTHROPIC, apiKey: 'k', model: 'claude-sonnet-5' },
            system: 'be brief',
            messages: [
                { role: 'user', content: [{ type: 'text', text: 'hi' }] },
                { role: 'assistant', content: [{ type: 'tool_call', id: 't1', name: 'lookup', arguments: { q: 1 } }] },
                { role: 'user', content: [{ type: 'tool_result', toolCallId: 't1', content: 'ok' }] },
            ],
            tools: [{ name: 'lookup', description: 'd', inputSchema: { type: 'object' } }],
        })
        expect(request.url).toBe('https://api.anthropic.com/v1/messages')
        expect(request.headers['x-api-key']).toBe('k')
        expect(request.body.system).toBe('be brief')
        expect(request.body.tools).toEqual([{ name: 'lookup', description: 'd', input_schema: { type: 'object' } }])
        expect(request.body.messages).toEqual([
            { role: 'user', content: [{ type: 'text', text: 'hi' }] },
            { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'lookup', input: { q: 1 } }] },
            { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok', is_error: undefined }] },
        ])
    })

    it('builds an OpenAI-compatible request with a custom base URL', () => {
        const request = llmWire.buildRequest({
            config: { provider: LlmProvider.DEEPSEEK, apiKey: 'k', model: 'deepseek-chat', baseUrl: 'https://proxy.local/v1/' },
            system: 's',
            messages: [
                { role: 'assistant', content: [{ type: 'tool_call', id: 'c1', name: 'f', arguments: { a: 1 } }] },
                { role: 'user', content: [{ type: 'tool_result', toolCallId: 'c1', content: 'r' }] },
            ],
            jsonOutput: true,
        })
        expect(request.url).toBe('https://proxy.local/v1/chat/completions')
        expect(request.headers.authorization).toBe('Bearer k')
        expect(request.body.max_tokens).toBe(4096)
        expect(request.body.response_format).toEqual({ type: 'json_object' })
        expect(request.body.messages).toEqual([
            { role: 'system', content: 's' },
            { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'f', arguments: '{"a":1}' } }] },
            { role: 'tool', tool_call_id: 'c1', content: 'r' },
        ])
    })
})

describe('llmWire.parseResponse', () => {
    it('reads Anthropic text, tool calls and usage', () => {
        const response = llmWire.parseResponse({
            provider: LlmProvider.ANTHROPIC,
            body: {
                content: [{ type: 'text', text: 'Let me check' }, { type: 'tool_use', id: 't', name: 'x', input: { a: 1 } }],
                stop_reason: 'tool_use',
                usage: { input_tokens: 10, output_tokens: 5 },
            },
        })
        expect(response.content).toEqual([
            { type: 'text', text: 'Let me check' },
            { type: 'tool_call', id: 't', name: 'x', arguments: { a: 1 } },
        ])
        expect(response.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
        expect(llmWire.textOf(response)).toBe('Let me check')
    })

    it('reads OpenAI tool calls and tolerates bad argument JSON', () => {
        const response = llmWire.parseResponse({
            provider: LlmProvider.OPENAI,
            body: {
                choices: [{ message: { content: null, tool_calls: [{ id: 'c', function: { name: 'f', arguments: '{bad' } }] }, finish_reason: 'tool_calls' }],
                usage: { prompt_tokens: 3, completion_tokens: 2 },
            },
        })
        expect(response.content).toEqual([{ type: 'tool_call', id: 'c', name: 'f', arguments: {} }])
        expect(response.usage).toEqual({ inputTokens: 3, outputTokens: 2 })
    })

    it('surfaces the provider error message', () => {
        expect(() => llmWire.parseResponse({ provider: LlmProvider.OPENAI, body: { error: { message: 'invalid api key' } } })).toThrow('invalid api key')
    })
})

describe('mcpWire', () => {
    it('picks the matching message out of an event stream', () => {
        const text = 'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"search","inputSchema":{"type":"object"}}]}}\n'
        const { result } = mcpWire.parseMessage({ contentType: 'text/event-stream', text, id: 2 })
        expect(mcpWire.toolsOf(result)).toEqual([{ name: 'search', description: '', inputSchema: { type: 'object' } }])
    })

    it('throws JSON-RPC errors', () => {
        expect(() => mcpWire.parseMessage({ contentType: 'application/json', text: '{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"nope"}}', id: 1 })).toThrow('MCP error -32601: nope')
    })

    it('flattens tool call content', () => {
        expect(mcpWire.toolResultOf({ content: [{ type: 'text', text: 'a' }, { type: 'image' }], isError: true })).toEqual({ text: 'a\n[image]', isError: true, structured: null })
    })

    it('adds the bearer prefix only when missing', () => {
        expect(mcpWire.headers({ authorization: 'abc' }).authorization).toBe('Bearer abc')
        expect(mcpWire.headers({ authorization: 'Basic xyz' }).authorization).toBe('Basic xyz')
    })

    it('parses incoming requests and rejects garbage', () => {
        expect(mcpWire.parseRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).toEqual({ id: 1, method: 'tools/list', params: {} })
        expect(mcpWire.parseRequest({ foo: 1 })).toBeNull()
    })
})
