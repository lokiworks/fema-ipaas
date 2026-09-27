import {
  createAction,
  LlmProvider,
  llmWire,
  Property,
  tryCatch,
} from '@fema-ipaas/connector-sdk';
import { aiAuth } from '../auth';
import { modelClient } from '../common/model-client';
import { textUtils } from '../common/text';

export const askModel = createAction({
  auth: aiAuth,
  name: 'ask_model',
  displayName: 'Ask model',
  description: 'Send a prompt to the model and use its reply as text or JSON',
  classification: 'READ',
  aiMetadata: {
    description:
      'Sends one prompt, with optional instructions, to the large language model of the connection and returns its reply. In JSON mode the reply is parsed into an object and the step fails when it is not valid JSON.',
    idempotent: false,
  },
  props: {
    instructions: Property.LongText({
      displayName: 'Instructions',
      description: 'Optional system prompt: the role, tone and rules the model follows',
      required: false,
    }),
    prompt: Property.LongText({
      displayName: 'Prompt',
      description: 'What to ask the model. Insert data from earlier steps here.',
      required: true,
    }),
    outputFormat: Property.StaticDropdown<OutputFormat, true>({
      displayName: 'Output format',
      description: 'JSON makes the model reply with an object that later steps can read field by field',
      required: true,
      defaultValue: 'TEXT',
      options: {
        disabled: false,
        options: [
          { label: 'Text', value: 'TEXT' },
          { label: 'JSON', value: 'JSON' },
        ],
      },
    }),
    maxTokens: Property.Number({
      displayName: 'Max tokens',
      description: 'Upper limit on the length of the reply (1 to 8192)',
      required: false,
      defaultValue: 1024,
    }),
  },
  async run(context) {
    const config = modelClient.configOf(context.auth.props);
    const json = context.propsValue.outputFormat === 'JSON';
    const response = await modelClient.call({
      config,
      system: systemPrompt({
        instructions: context.propsValue.instructions,
        json,
        provider: config.provider,
      }),
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: textUtils.asText(context.propsValue.prompt) }],
        },
      ],
      maxTokens: textUtils.clamp({
        value: context.propsValue.maxTokens,
        min: 1,
        max: MAX_TOKENS_LIMIT,
        fallback: DEFAULT_MAX_TOKENS,
      }),
      jsonOutput: json,
    });
    await modelClient.reportUsage({
      context,
      feature: 'ASK_MODEL',
      provider: config.provider,
      model: config.model,
      usage: response.usage,
    });
    const text = llmWire.textOf(response);
    return {
      text,
      json: json ? await parseJsonReply({ text, truncated: response.truncated }) : null,
      usage: response.usage,
      model: config.model,
    };
  },
});

function systemPrompt({
  instructions,
  json,
  provider,
}: {
  instructions: string | undefined;
  json: boolean;
  provider: LlmProvider;
}): string | undefined {
  const base = textUtils.isBlank(instructions) ? undefined : textUtils.asText(instructions);
  if (!json) {
    return base;
  }
  if (provider === LlmProvider.ANTHROPIC) {
    return base ?? DEFAULT_JSON_SYSTEM;
  }
  return base === undefined ? `${DEFAULT_JSON_SYSTEM}\n\n${JSON_HINT}` : `${base}\n\n${JSON_HINT}`;
}

async function parseJsonReply({
  text,
  truncated,
}: {
  text: string;
  truncated: boolean;
}): Promise<unknown> {
  const fenced = FENCE_PATTERN.exec(text);
  const candidate = fenced === null ? text : fenced[1];
  const { data, error } = await tryCatch(async () => {
    const value: unknown = JSON.parse(candidate);
    return value;
  });
  if (error !== null) {
    const reason = truncated
      ? 'the reply was cut off by Max tokens, raise it and try again'
      : `the reply was: ${textUtils.truncate({ text, limit: ERROR_REPLY_LIMIT })}`;
    throw new Error(`The model did not reply with valid JSON (${reason})`);
  }
  return data;
}

const DEFAULT_MAX_TOKENS = 1024;
const MAX_TOKENS_LIMIT = 8192;
const ERROR_REPLY_LIMIT = 200;
const DEFAULT_JSON_SYSTEM = 'You are a precise assistant inside an automation workflow.';
const JSON_HINT = 'Reply with a single JSON object and nothing else.';
const FENCE_PATTERN = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i;

type OutputFormat = 'TEXT' | 'JSON';
