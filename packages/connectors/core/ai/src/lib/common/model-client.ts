import {
  AuthenticationType,
  httpClient,
  HttpError,
  HttpMethod,
} from '@fema-ipaas/connector-common';
import {
  LlmConfig,
  LlmMessage,
  LlmProvider,
  LlmResponse,
  LlmTool,
  LlmUsage,
  llmWire,
  tryCatch,
} from '@fema-ipaas/connector-sdk';
import { z } from 'zod';
import { textUtils } from './text';

export const modelClient = {
  configOf,
  call,
  reportUsage,
};

function configOf({
  provider,
  apiKey,
  model,
  baseUrl,
}: {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
}): LlmConfig {
  return {
    provider,
    apiKey: apiKey.trim(),
    model: model.trim(),
    ...(baseUrl === undefined || baseUrl === null || textUtils.isBlank(baseUrl)
      ? {}
      : { baseUrl: baseUrl.trim() }),
  };
}

async function call({
  config,
  system,
  messages,
  tools,
  maxTokens,
  jsonOutput,
}: ModelCallParams): Promise<LlmResponse> {
  const request = llmWire.buildRequest({
    config,
    system,
    messages,
    tools,
    maxTokens,
    jsonOutput,
  });
  const { data, error } = await tryCatch(() =>
    httpClient.sendRequest<unknown>({
      method: HttpMethod.POST,
      url: request.url,
      headers: request.headers,
      body: request.body,
      timeout: MODEL_TIMEOUT_MS,
    }),
  );
  if (error !== null) {
    throw new Error(describeFailure(error));
  }
  return llmWire.parseResponse({ provider: config.provider, body: data.body });
}

async function reportUsage({
  context,
  feature,
  provider,
  model,
  usage,
}: ReportUsageParams): Promise<void> {
  await tryCatch(() =>
    httpClient.sendRequest({
      method: HttpMethod.POST,
      url: `${context.server.apiUrl.replace(/\/$/, '')}/v1/worker/ai-usage`,
      authentication: {
        type: AuthenticationType.BEARER_TOKEN,
        token: context.server.token,
      },
      body: {
        feature,
        provider,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        workflowId: context.workflows.current.id,
        executionId: context.run.id,
      },
      timeout: USAGE_TIMEOUT_MS,
    }),
  );
}

function describeFailure(error: Error): string {
  if (error instanceof HttpError) {
    return `Model provider returned HTTP ${error.response.status}: ${providerMessageOf(error.response.body)}`;
  }
  return `Could not reach the model provider: ${error.message}`;
}

function providerMessageOf(body: unknown): string {
  const parsed = ProviderError.safeParse(body);
  if (parsed.success) {
    const detail = parsed.data.error;
    if (typeof detail === 'string') {
      return detail;
    }
    if (detail.message !== undefined) {
      return detail.message;
    }
  }
  return textUtils.truncate({
    text: textUtils.asText(body),
    limit: ERROR_BODY_LIMIT,
  });
}

const MODEL_TIMEOUT_MS = 120000;
const USAGE_TIMEOUT_MS = 10000;
const ERROR_BODY_LIMIT = 300;

const ProviderError = z.object({
  error: z.union([
    z.string(),
    z.object({ message: z.string().optional() }),
  ]),
});

export type ModelCallParams = {
  config: LlmConfig;
  system?: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  maxTokens?: number;
  jsonOutput?: boolean;
};

export type UsageFeature = 'ASK_MODEL' | 'AGENT';

export type UsageContext = {
  server: { apiUrl: string; token: string };
  workflows: { current: { id: string } };
  run: { id: string };
};

type ReportUsageParams = {
  context: UsageContext;
  feature: UsageFeature;
  provider: LlmProvider;
  model: string;
  usage: LlmUsage;
};
