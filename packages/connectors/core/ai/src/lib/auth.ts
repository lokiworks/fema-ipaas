import {
  ConnectorAuth,
  LlmProvider,
  Property,
  tryCatch,
} from '@fema-ipaas/connector-sdk';
import { modelClient } from './common/model-client';
import { textUtils } from './common/text';

export const aiAuth = ConnectorAuth.CustomAuth({
  displayName: 'Model',
  description: 'The model provider, API key and model that steps using this connection call',
  required: true,
  props: {
    provider: Property.StaticDropdown<LlmProvider, true>({
      displayName: 'Provider',
      required: true,
      defaultValue: LlmProvider.ANTHROPIC,
      options: {
        disabled: false,
        options: [
          { label: 'Anthropic Claude', value: LlmProvider.ANTHROPIC },
          { label: 'OpenAI', value: LlmProvider.OPENAI },
          { label: 'DeepSeek', value: LlmProvider.DEEPSEEK },
          {
            label: 'OpenAI-compatible (e.g. Ollama, vLLM, Qwen)',
            value: LlmProvider.OPENAI_COMPATIBLE,
          },
        ],
      },
    }),
    apiKey: ConnectorAuth.SecretText({
      displayName: 'API key',
      required: true,
    }),
    model: Property.ShortText({
      displayName: 'Model',
      description: 'The model ID, e.g. claude-sonnet-5, gpt-4.1 or deepseek-chat',
      required: true,
    }),
    baseUrl: Property.ShortText({
      displayName: 'Base URL',
      description: 'Leave empty for the provider default; required for OpenAI-compatible providers',
      required: false,
    }),
  },
  validate: async ({ auth }) => {
    if (auth.provider === LlmProvider.OPENAI_COMPATIBLE && textUtils.isBlank(auth.baseUrl)) {
      return {
        valid: false,
        error: 'Base URL is required for OpenAI-compatible providers',
      };
    }
    const { error } = await tryCatch(() =>
      modelClient.call({
        config: modelClient.configOf(auth),
        messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
        maxTokens: 16,
      }),
    );
    if (error !== null) {
      return { valid: false, error: error.message };
    }
    return { valid: true };
  },
});
