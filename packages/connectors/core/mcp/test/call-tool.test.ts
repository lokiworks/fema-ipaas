/// <reference types="vitest/globals" />

import { ConnectionType, createMockActionContext } from '@fema-ipaas/connector-sdk';

import { callTool } from '../src/lib/actions/call-tool';
import { listTools } from '../src/lib/actions/list-tools';
import { fakeHttp, RecordedRequest } from './fake-http';

const MCP_URL = 'http://mcp.test/mcp';

describe('callTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('returns the tool result and reuses the session id', async () => {
    const requests = installServer({
      onCall: ({ name, arguments: args }) => ({
        content: [{ type: 'text', text: `${name} ok` }],
        structuredContent: { received: args },
        isError: false,
      }),
    });

    const result = await callTool.run(
      toolContext({ tool: 'create_ticket', args: { title: 'Printer broken' } }),
    );

    expect(result).toEqual({
      text: 'create_ticket ok',
      isError: false,
      structured: { received: { title: 'Printer broken' } },
    });
    const methods = requests.map(methodOf);
    expect(methods).toEqual(['initialize', 'notifications/initialized', 'tools/call']);
    expect(requests[0].headers['mcp-session-id']).toBeUndefined();
    expect(requests[1].headers['mcp-session-id']).toBe('session-7');
    expect(requests[2].headers['mcp-session-id']).toBe('session-7');
    expect(requests[2].headers['authorization']).toBe('Bearer secret-token');
    expect(requests[2].headers['accept']).toContain('text/event-stream');
    expect(requests[2].body).toMatchObject({
      method: 'tools/call',
      params: { name: 'create_ticket', arguments: { title: 'Printer broken' } },
    });
  });

  test('fails the step when the tool reports an error', async () => {
    installServer({
      onCall: () => ({ content: [{ type: 'text', text: 'Ticket queue is full' }], isError: true }),
    });

    await expect(callTool.run(toolContext({ tool: 'create_ticket', args: {} }))).rejects.toThrow(
      'Ticket queue is full',
    );
  });

  test('reports HTTP failures with the status', async () => {
    fakeHttp.install({
      routes: { [MCP_URL]: () => new Response('Unauthorized', { status: 401 }) },
    });

    await expect(callTool.run(toolContext({ tool: 'create_ticket', args: {} }))).rejects.toThrow(
      'MCP server http://mcp.test/mcp returned HTTP 401: Unauthorized',
    );
  });

  test('lists the tools of the server', async () => {
    installServer({ onCall: () => ({}) });

    const result = await listTools.run({
      ...createMockActionContext<typeof listTools.props>({ propsValue: {} }),
      auth: authValue(),
    });

    expect(result).toEqual({
      tools: [
        {
          name: 'create_ticket',
          description: 'Create a ticket',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });
  });
});

function installServer({
  onCall,
}: {
  onCall: (params: { name: string; arguments: unknown }) => Record<string, unknown>;
}): RecordedRequest[] {
  return fakeHttp.install({
    routes: {
      [MCP_URL]: fakeHttp.mcpServer({
        sessionId: 'session-7',
        tools: [{ name: 'create_ticket', description: 'Create a ticket' }],
        onCall,
      }),
    },
  });
}

function toolContext({ tool, args }: { tool: string; args: Record<string, unknown> }) {
  return {
    ...createMockActionContext<typeof callTool.props>({
      propsValue: { tool, arguments: args },
    }),
    auth: authValue(),
  };
}

function authValue() {
  return {
    type: ConnectionType.CUSTOM_AUTH,
    props: { url: MCP_URL, token: 'secret-token' },
  };
}

function methodOf(request: RecordedRequest): unknown {
  return typeof request.body === 'object' && request.body !== null && 'method' in request.body
    ? request.body.method
    : undefined;
}
