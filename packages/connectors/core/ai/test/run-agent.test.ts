/// <reference types="vitest/globals" />

import {
  ConnectionType,
  createMockActionContext,
  LlmProvider,
} from '@fema-ipaas/connector-sdk';

import { runAgent } from '../src/lib/actions/run-agent';
import { fakeHttp, RecordedRequest } from './fake-http';

const MODEL_URL = 'https://api.anthropic.com/v1/messages';
const MCP_URL = 'http://mcp.test/mcp';
const USAGE_URL = 'http://localhost:3000/v1/worker/ai-usage';

describe('runAgent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('feeds tool results back to the model and records the steps', async () => {
    const requests = installServers({
      replies: [toolUseReply({ id: 'call-1', input: { orderId: '42' } }), textReply('Order 42 has shipped')],
    });

    const result = await runAgent.run(agentContext({ allowedTools: [], maxSteps: 5 }));

    expect(result).toEqual({
      answer: 'Order 42 has shipped',
      steps: [
        { tool: 'lookup_order', arguments: { orderId: '42' }, result: 'status of 42: shipped', isError: false },
      ],
      usage: { inputTokens: 30, outputTokens: 12 },
      stoppedEarly: false,
    });

    const modelCalls = requests.filter((request) => request.url === MODEL_URL);
    expect(modelCalls).toHaveLength(2);
    expect(modelCalls[0].body).toMatchObject({
      system: 'Answer questions about orders',
      tools: [{ name: 'lookup_order', description: 'Look up an order' }],
    });
    expect(modelCalls[1].body).toMatchObject({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Where is order 42?' }] },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'call-1', name: 'lookup_order', input: { orderId: '42' } }],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call-1', content: 'status of 42: shipped', is_error: false },
          ],
        },
      ],
    });

    const toolCall = requests.find((request) => request.url === MCP_URL && methodOf(request) === 'tools/call');
    expect(toolCall?.headers['mcp-session-id']).toBe('session-1');
    expect(toolCall?.headers['authorization']).toBe('Bearer mcp-token');

    const usageReports = requests.filter((request) => request.url === USAGE_URL);
    expect(usageReports).toHaveLength(1);
    expect(usageReports[0].headers['authorization']).toBe('Bearer test-token');
    expect(usageReports[0].body).toEqual({
      feature: 'AGENT',
      provider: LlmProvider.ANTHROPIC,
      model: 'claude-test',
      inputTokens: 30,
      outputTokens: 12,
      workflowId: 'test-workflow-id',
      executionId: 'test-run-id',
    });
  });

  test('blocks tools that are not in the allowed list', async () => {
    const requests = installServers({
      replies: [toolUseReply({ id: 'call-1', input: { orderId: '42' } }), textReply('I cannot look that up')],
    });

    const result = await runAgent.run(agentContext({ allowedTools: ['cancel_order'], maxSteps: 5 }));

    expect(result.steps).toEqual([
      {
        tool: 'lookup_order',
        arguments: { orderId: '42' },
        result: 'Tool lookup_order is not in the allowed tools of this step',
        isError: true,
      },
    ]);
    const modelCalls = requests.filter((request) => request.url === MODEL_URL);
    expect(modelCalls[0].body).not.toHaveProperty('tools');
    expect(modelCalls[1].body).toMatchObject({
      messages: [
        {},
        {},
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', is_error: true }] },
      ],
    });
    expect(requests.some((request) => request.url === MCP_URL && methodOf(request) === 'tools/call')).toBe(false);
  });

  test('stops early when the step limit is reached', async () => {
    const requests = installServers({
      replies: [toolUseReply({ id: 'call-1', input: { orderId: '1' } })],
    });

    const result = await runAgent.run(agentContext({ allowedTools: [], maxSteps: 1 }));

    expect(result.stoppedEarly).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
    expect(requests.filter((request) => request.url === MODEL_URL)).toHaveLength(2);
    expect(requests.filter((request) => methodOf(request) === 'tools/call')).toHaveLength(1);
  });

  test('fails with the provider message when the model call is rejected', async () => {
    const requests = fakeHttp.install({
      routes: {
        [MCP_URL]: mcpRoute(),
        [MODEL_URL]: () =>
          fakeHttp.jsonResponse({
            status: 401,
            body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
          }),
        [USAGE_URL]: () => fakeHttp.jsonResponse({ body: {} }),
      },
    });

    await expect(runAgent.run(agentContext({ allowedTools: [], maxSteps: 5 }))).rejects.toThrow(
      'Model provider returned HTTP 401: invalid x-api-key',
    );
    expect(requests.some((request) => request.url === USAGE_URL)).toBe(false);
  });
});

function installServers({ replies }: { replies: Record<string, unknown>[] }): RecordedRequest[] {
  const next = sequence(replies);
  return fakeHttp.install({
    routes: {
      [MCP_URL]: mcpRoute(),
      [MODEL_URL]: () => fakeHttp.jsonResponse({ body: next() }),
      [USAGE_URL]: () => fakeHttp.jsonResponse({ body: {} }),
    },
  });
}

function mcpRoute() {
  return fakeHttp.mcpServer({
    sessionId: 'session-1',
    tools: [
      { name: 'lookup_order', description: 'Look up an order' },
    ],
    onCall: ({ arguments: args }) => ({
      content: [
        {
          type: 'text',
          text: `status of ${typeof args === 'object' && args !== null && 'orderId' in args ? String(args.orderId) : '?'}: shipped`,
        },
      ],
      isError: false,
    }),
  });
}

function agentContext({ allowedTools, maxSteps }: { allowedTools: string[]; maxSteps: number }) {
  return {
    ...createMockActionContext<typeof runAgent.props>({
      propsValue: {
        instructions: 'Answer questions about orders',
        input: 'Where is order 42?',
        mcpServers: [{ url: MCP_URL, authorization: 'mcp-token' }],
        allowedTools,
        maxSteps,
      },
    }),
    auth: {
      type: ConnectionType.CUSTOM_AUTH,
      props: {
        provider: LlmProvider.ANTHROPIC,
        apiKey: 'sk-test',
        model: 'claude-test',
        baseUrl: undefined,
      },
    },
  };
}

function toolUseReply({ id, input }: { id: string; input: Record<string, unknown> }) {
  return {
    content: [{ type: 'tool_use', id, name: 'lookup_order', input }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function textReply(text: string) {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 20, output_tokens: 7 },
  };
}

function sequence<T>(items: T[]): () => T {
  let index = 0;
  return () => {
    const item = items[Math.min(index, items.length - 1)];
    index += 1;
    return item;
  };
}

function methodOf(request: RecordedRequest): unknown {
  return typeof request.body === 'object' && request.body !== null && 'method' in request.body
    ? request.body.method
    : undefined;
}
