/// <reference types="vitest/globals" />

import { mcpClient } from '../src/lib/common/mcp-client';
import { McpAuthType, McpTransport } from '../src/lib/common/mcp-target';

describe('SSE transport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('reads the endpoint event and answers requests over the stream', async () => {
    const posted: { url: string; body: unknown; auth: string | null }[] = [];
    const encoder = new TextEncoder();
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();
    const push = (text: string) => writer.write(encoder.encode(text));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (init?.method === 'GET') {
        void push('event: endpoint\ndata: /messages?sessionId=42\n\n');
        return new Response(stream.readable, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      posted.push({ url, body, auth: new Headers(init?.headers).get('authorization') });
      if (isRequest(body)) {
        const result = body.method === 'tools/list'
          ? { tools: [{ name: 'fetch', description: 'Fetch a page', inputSchema: { type: 'object' } }] }
          : { protocolVersion: '2024-11-05', capabilities: {} };
        void push(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result })}\n\n`);
      }
      return new Response(null, { status: 202 });
    });

    const session = await mcpClient.connect({
      target: { url: 'https://legacy.example.com/sse', transport: McpTransport.SSE, authType: McpAuthType.BEARER, authorization: 'secret' },
      timeoutMs: 2000,
    });
    const tools = await mcpClient.listTools({ session });
    await mcpClient.close({ session });

    expect(tools.map((tool) => tool.name)).toEqual(['fetch']);
    expect(posted[0].url).toBe('https://legacy.example.com/messages?sessionId=42');
    expect(posted[0].auth).toBe('Bearer secret');
    expect(posted.map((entry) => (isRequest(entry.body) ? entry.body.method : 'notification'))).toEqual(['initialize', 'notification', 'tools/list']);
  });

  test('rejects servers that do not open an event stream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(mcpClient.connect({
      target: { url: 'https://a/mcp', transport: McpTransport.SSE, authType: McpAuthType.NONE, authorization: undefined },
      timeoutMs: 1000,
    })).rejects.toThrow('did not open an SSE stream');
  });
});

function isRequest(value: unknown): value is { id: number; method: string } {
  return typeof value === 'object' && value !== null && 'id' in value && 'method' in value;
}
