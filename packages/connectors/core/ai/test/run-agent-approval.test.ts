/// <reference types="vitest/globals" />

import {
  ConnectionType,
  createMockActionContext,
  ExecutionType,
  LlmProvider,
} from '@fema-ipaas/connector-sdk';

import { runAgent } from '../src/lib/actions/run-agent';
import { fakeHttp } from './fake-http';

const MODEL_URL = 'https://api.anthropic.com/v1/messages';
const MCP_URL = 'http://mcp.test/mcp';
const USAGE_URL = 'http://localhost:3000/v1/worker/ai-usage';
const APPROVAL_URL = 'http://localhost:3000/v1/worker/agent-approvals';

describe('runAgent approvals', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('pauses before a write tool, then runs it after approval', async () => {
    const toolCalls: unknown[] = [];
    const replies = [
      {
        content: [
          { type: 'text', text: 'I will open a ticket.' },
          { type: 'tool_use', id: 'call-1', name: 'create_ticket', input: { title: 'VPN down' } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        content: [{ type: 'text', text: 'Ticket T-1 created' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 20, output_tokens: 7 },
      },
    ];
    let reply = 0;
    const requests = fakeHttp.install({
      routes: {
        [MCP_URL]: fakeHttp.mcpServer({
          sessionId: 'session-1',
          tools: [{ name: 'create_ticket', description: 'Create a ticket' }],
          onCall: ({ arguments: args }) => {
            toolCalls.push(args);
            return { content: [{ type: 'text', text: 'T-1' }], isError: false };
          },
        }),
        [MODEL_URL]: () => {
          const body = replies[Math.min(reply, replies.length - 1)];
          reply += 1;
          return fakeHttp.jsonResponse({ body });
        },
        [USAGE_URL]: () => fakeHttp.jsonResponse({ body: {} }),
        [APPROVAL_URL]: () => fakeHttp.jsonResponse({ status: 201, body: { id: 'approval-1' } }),
      },
    });
    const store = new Map<string, unknown>();
    const waitFor = vi.fn();

    const paused = await runAgent.run(agentContext({ store, waitFor, resume: null }));

    expect(paused).toMatchObject({ status: 'WAITING_FOR_APPROVAL', approvalId: 'approval-1', tool: 'create_ticket' });
    expect(waitFor).toHaveBeenCalledWith('wp-1');
    expect(toolCalls).toHaveLength(0);
    const approvalRequest = requests.find((request) => request.url === APPROVAL_URL);
    expect(approvalRequest?.body).toMatchObject({
      executionId: 'test-run-id',
      stepName: 'agent',
      waitpointId: 'wp-1',
      tool: 'create_ticket',
      arguments: { title: 'VPN down' },
      message: 'I will open a ticket.',
      timeoutHours: 4,
    });

    const finished = await runAgent.run(
      agentContext({ store, waitFor, resume: { approvalId: 'approval-1', approved: true, expired: false, comment: null } }),
    );

    expect(finished).toMatchObject({
      answer: 'Ticket T-1 created',
      steps: [{ tool: 'create_ticket', result: 'T-1', isError: false }],
      usage: { inputTokens: 30, outputTokens: 12 },
    });
    expect(toolCalls).toEqual([{ title: 'VPN down' }]);
    const usageBodies = requests.filter((request) => request.url === USAGE_URL).map((request) => request.body);
    expect(usageBodies).toMatchObject([
      { inputTokens: 10, outputTokens: 5 },
      { inputTokens: 20, outputTokens: 7 },
    ]);
    expect(store.size).toBe(0);
  });

  test('tells the model when a call was rejected and does not run it', async () => {
    const toolCalls: unknown[] = [];
    let reply = 0;
    const replies = [
      {
        content: [{ type: 'tool_use', id: 'call-1', name: 'delete_user', input: { id: 7 } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      {
        content: [{ type: 'text', text: 'I did not delete the user.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    ];
    const requests = fakeHttp.install({
      routes: {
        [MCP_URL]: fakeHttp.mcpServer({
          sessionId: 'session-1',
          tools: [{ name: 'delete_user', description: 'Delete a user' }],
          onCall: ({ arguments: args }) => {
            toolCalls.push(args);
            return { content: [{ type: 'text', text: 'deleted' }], isError: false };
          },
        }),
        [MODEL_URL]: () => {
          const body = replies[Math.min(reply, replies.length - 1)];
          reply += 1;
          return fakeHttp.jsonResponse({ body });
        },
        [USAGE_URL]: () => fakeHttp.jsonResponse({ body: {} }),
        [APPROVAL_URL]: () => fakeHttp.jsonResponse({ status: 201, body: { id: 'approval-2' } }),
      },
    });
    const store = new Map<string, unknown>();
    await runAgent.run(agentContext({ store, waitFor: vi.fn(), resume: null }));
    const finished = await runAgent.run(
      agentContext({ store, waitFor: vi.fn(), resume: { approvalId: 'approval-2', approved: false, expired: false, comment: 'wrong user' } }),
    );

    expect(toolCalls).toHaveLength(0);
    expect(finished).toMatchObject({ steps: [{ tool: 'delete_user', isError: true }] });
    const lastModelCall = requests.filter((request) => request.url === MODEL_URL).pop();
    expect(JSON.stringify(lastModelCall?.body)).toContain('A person rejected this call: wrong user');
  });
});

function agentContext({
  store,
  waitFor,
  resume,
}: {
  store: Map<string, unknown>;
  waitFor: (id: string) => void;
  resume: Record<string, unknown> | null;
}) {
  const base = createMockActionContext<typeof runAgent.props>({
    propsValue: {
      instructions: 'Help with IT requests',
      input: 'The VPN is down',
      mcpServers: [{ url: MCP_URL, authorization: 'mcp-token' }],
      allowedTools: [],
      maxSteps: 5,
      confirmWrites: true,
      confirmTools: [],
      approvalTimeoutHours: 4,
    },
  });
  return {
    ...base,
    ...(resume === null
      ? { executionType: ExecutionType.BEGIN }
      : { executionType: ExecutionType.RESUME, resumePayload: { body: resume, headers: {}, queryParams: {} } }),
    step: { name: 'agent' },
    store: {
      put: async <T>(key: string, value: T) => {
        store.set(key, value);
        return value;
      },
      get: async <T>(key: string) => {
        const value = store.get(key);
        return value === undefined ? null : (value as T);
      },
      delete: async (key: string) => {
        store.delete(key);
      },
    },
    run: {
      ...base.run,
      createWaitpoint: async () => ({ id: 'wp-1', resumeUrl: 'http://resume', buildResumeUrl: () => 'http://resume' }),
      waitForWaitpoint: waitFor,
    },
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
