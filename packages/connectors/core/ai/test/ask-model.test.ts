/// <reference types="vitest/globals" />

import {
  ConnectionType,
  createMockActionContext,
  LlmProvider,
} from '@fema-ipaas/connector-sdk';

import { askModel } from '../src/lib/actions/ask-model';
import { fakeHttp } from './fake-http';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const USAGE_URL = 'http://localhost:3000/v1/worker/ai-usage';

describe('askModel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('parses a JSON reply, even inside a code fence', async () => {
    const requests = fakeHttp.install({
      routes: {
        [ANTHROPIC_URL]: () =>
          fakeHttp.jsonResponse({
            body: {
              content: [{ type: 'text', text: '```json\n{"city":"Shanghai","count":3}\n```' }],
              stop_reason: 'end_turn',
              usage: { input_tokens: 12, output_tokens: 8 },
            },
          }),
        [USAGE_URL]: () => fakeHttp.jsonResponse({ body: {} }),
      },
    });

    const result = await askModel.run(
      modelContext({ provider: LlmProvider.ANTHROPIC, outputFormat: 'JSON', instructions: undefined }),
    );

    expect(result).toEqual({
      text: '```json\n{"city":"Shanghai","count":3}\n```',
      json: { city: 'Shanghai', count: 3 },
      usage: { inputTokens: 12, outputTokens: 8 },
      model: 'test-model',
    });
    const modelCall = requests.find((request) => request.url === ANTHROPIC_URL);
    expect(modelCall?.body).toMatchObject({ max_tokens: 1024 });
    expect(JSON.stringify(modelCall?.body)).toContain('Reply with a single JSON object');
    const usage = requests.find((request) => request.url === USAGE_URL);
    expect(usage?.body).toMatchObject({ feature: 'ASK_MODEL', inputTokens: 12, outputTokens: 8 });
  });

  test('asks OpenAI for a JSON object and mentions JSON in the prompt', async () => {
    const requests = fakeHttp.install({
      routes: {
        [OPENAI_URL]: () =>
          fakeHttp.jsonResponse({
            body: {
              choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 5, completion_tokens: 3 },
            },
          }),
        [USAGE_URL]: () => fakeHttp.jsonResponse({ body: {} }),
      },
    });

    const result = await askModel.run(
      modelContext({ provider: LlmProvider.OPENAI, outputFormat: 'JSON', instructions: 'Be terse' }),
    );

    expect(result.json).toEqual({ ok: true });
    const modelCall = requests.find((request) => request.url === OPENAI_URL);
    expect(modelCall?.body).toMatchObject({
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: 'Be terse\n\nReply with a single JSON object and nothing else.' }, { role: 'user' }],
    });
  });

  test('fails clearly when the JSON reply is not valid JSON', async () => {
    fakeHttp.install({
      routes: {
        [ANTHROPIC_URL]: () =>
          fakeHttp.jsonResponse({
            body: {
              content: [{ type: 'text', text: 'Sure! The city is Shanghai.' }],
              stop_reason: 'end_turn',
              usage: { input_tokens: 1, output_tokens: 1 },
            },
          }),
        [USAGE_URL]: () => fakeHttp.jsonResponse({ body: {} }),
      },
    });

    await expect(
      askModel.run(modelContext({ provider: LlmProvider.ANTHROPIC, outputFormat: 'JSON', instructions: undefined })),
    ).rejects.toThrow('The model did not reply with valid JSON');
  });

  test('returns plain text with no json in text mode', async () => {
    fakeHttp.install({
      routes: {
        [ANTHROPIC_URL]: () =>
          fakeHttp.jsonResponse({
            body: {
              content: [{ type: 'text', text: 'Hello there' }],
              stop_reason: 'end_turn',
              usage: { input_tokens: 1, output_tokens: 2 },
            },
          }),
        [USAGE_URL]: () => fakeHttp.jsonResponse({ status: 500, body: { message: 'down' } }),
      },
    });

    const result = await askModel.run(
      modelContext({ provider: LlmProvider.ANTHROPIC, outputFormat: 'TEXT', instructions: undefined }),
    );

    expect(result).toMatchObject({ text: 'Hello there', json: null });
  });
});

function modelContext({
  provider,
  outputFormat,
  instructions,
}: {
  provider: LlmProvider;
  outputFormat: 'TEXT' | 'JSON';
  instructions: string | undefined;
}) {
  return {
    ...createMockActionContext<typeof askModel.props>({
      propsValue: {
        instructions,
        prompt: 'Which city and how many?',
        outputFormat,
        maxTokens: undefined,
      },
    }),
    auth: {
      type: ConnectionType.CUSTOM_AUTH,
      props: {
        provider,
        apiKey: 'sk-test',
        model: 'test-model',
        baseUrl: undefined,
      },
    },
  };
}
