import {
  AuthenticationType,
  HttpError,
  HttpMethod,
  httpClient,
} from '@fema-ipaas/connector-common';
import {
  tryCatch,
  type ConnectionValueForAuthProperty,
} from '@fema-ipaas/connector-sdk';

import type { beisenAuth } from '../auth';
import { BEISEN_BASE_URL } from '../constants';

export const beisenCommon = {
  obtainAccessToken,
  callApi,
  callBusinessApi,
  filterByColumn,
  columnsWith,
};

function filterByColumn({ records, column, values }: FilterByColumnParams): Record<string, unknown>[] {
  const wanted = values.map((value) => value.trim()).filter((value) => value.length > 0);
  const name = column?.trim() ?? '';
  if (name.length === 0 || wanted.length === 0) {
    return records;
  }
  return records.filter((record) => {
    const value = record[name];
    return value !== undefined && value !== null && wanted.includes(String(value).trim());
  });
}

function columnsWith({ columns, column }: { columns: string[]; column: string | undefined }): string[] {
  const name = column?.trim() ?? '';
  if (columns.length === 0 || name.length === 0 || columns.includes(name)) {
    return columns;
  }
  return [...columns, name];
}

type FilterByColumnParams = {
  records: Record<string, unknown>[];
  column: string | undefined;
  values: string[];
};

async function obtainAccessToken({ appKey, appSecret }: TokenParams): Promise<string> {
  const cacheKey = `${appKey ?? ''}:${appSecret ?? ''}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  const response = await httpClient.sendRequest<TokenResponse>({
    method: HttpMethod.POST,
    url: `${BEISEN_BASE_URL}/token`,
    body: {
      grant_type: 'client_credentials',
      app_key: appKey,
      app_secret: appSecret,
    },
  });
  assertNoGatewayError(response.body);
  const token = response.body.access_token;
  if (!token) {
    throw new Error('Beisen did not return an access_token, check the connector Key and Secret');
  }
  const lifetimeSeconds = response.body.expires_in ?? DEFAULT_TOKEN_LIFETIME_SECONDS;
  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + Math.max(lifetimeSeconds - TOKEN_EXPIRY_MARGIN_SECONDS, 60) * 1000,
  });
  return token;
}

async function callApi<T>({ auth, method, path, body, queryParams }: CallApiParams): Promise<T> {
  const token = await obtainAccessToken({
    appKey: auth.props.appKey,
    appSecret: auth.props.appSecret,
  });
  const { data: response, error } = await tryCatch(() =>
    httpClient.sendRequest<T & Partial<GatewayError>>({
      method,
      url: `${BEISEN_BASE_URL}${path}`,
      authentication: { type: AuthenticationType.BEARER_TOKEN, token },
      ...(body ? { body } : {}),
      ...(queryParams ? { queryParams } : {}),
    }),
  );
  if (error) {
    throw isRateLimited(error) ? rateLimitError() : error;
  }
  assertNoGatewayError(response.body);
  return response.body;
}

async function callBusinessApi<T>(params: CallApiParams): Promise<T> {
  const body = await callApi<BusinessEnvelope<T>>(params);
  if (body.data === undefined || body.data === null) {
    const message = body.message ?? 'Beisen returned no data for this request';
    throw new Error(
      body.code === undefined ? message : `${message} (Beisen code ${body.code})`,
    );
  }
  return body.data;
}

function isRateLimited(error: Error): boolean {
  return error instanceof HttpError && error.response.status === HTTP_TOO_MANY_REQUESTS;
}

function rateLimitError(): Error {
  return new Error(
    `HTTP ${HTTP_TOO_MANY_REQUESTS}: Beisen API rate limit exceeded. Beisen stops answering this tenant for the rest of the day and allows calls again at 00:00 the next day, so retrying now will not help. Lower how often the workflow polls or how much history it replays (Beisen rate limit)`,
  );
}

function assertNoGatewayError(body: Partial<GatewayError>): void {
  if (!body.error) {
    return;
  }
  if (isRateLimitMessage(body.error_description ?? body.error)) {
    throw rateLimitError();
  }
  const code = body.error_code ?? body.error;
  const description = body.error_description ?? body.error;
  throw new Error(`${description} (Beisen error ${code})`);
}

const HTTP_TOO_MANY_REQUESTS = 429;

function isRateLimitMessage(message: string): boolean {
  return message.toLowerCase().includes('rate limit exceeded');
}

const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;

const TOKEN_EXPIRY_MARGIN_SECONDS = 300;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export type BeisenAuthValue = ConnectionValueForAuthProperty<typeof beisenAuth>;

type TokenParams = { appKey?: string; appSecret?: string };

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
} & Partial<GatewayError>;

type GatewayError = {
  error: string;
  error_description: string;
  error_code: string;
};

type BusinessEnvelope<T> = { data?: T; code?: number; message?: string };

type CallApiParams = {
  auth: BeisenAuthValue;
  method: HttpMethod;
  path: string;
  body?: unknown;
  queryParams?: Record<string, string>;
};
