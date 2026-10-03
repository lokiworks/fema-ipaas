import {
  AuthenticationType,
  HttpError,
  HttpMethod,
  httpClient,
} from '@fema-ipaas/connector-common';
import {
  blockedUntilMarker,
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
  readPath,
  nextBeijingMidnight,
};

class CredentialRejectedError extends Error {}

class AccessTokenRejectedError extends Error {}

function filterByColumn({ records, column, values }: FilterByColumnParams): Record<string, unknown>[] {
  const wanted = values.map((value) => value.trim()).filter((value) => value.length > 0);
  const name = column?.trim() ?? '';
  if (name.length === 0 || wanted.length === 0) {
    return records;
  }
  return records.filter((record) => {
    const value = readPath({ record, path: name });
    return value !== undefined && value !== null && wanted.includes(String(value).trim());
  });
}

function readPath({ record, path }: { record: Record<string, unknown>; path: string }): unknown {
  if (path in record) {
    return record[path];
  }
  return path.split('.').reduce<unknown>((current, key) => {
    return typeof current === 'object' && current !== null && key in current
      ? Reflect.get(current, key)
      : undefined;
  }, record);
}

type FilterByColumnParams = {
  records: Record<string, unknown>[];
  column: string | undefined;
  values: string[];
};

async function obtainAccessToken({ appKey, appSecret }: TokenParams): Promise<string> {
  const cacheKey = tokenCacheKey({ appKey, appSecret });
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
  assertNoGatewayError({ body: response.body, rejectsCredentials: true });
  const token = response.body.access_token;
  if (!token) {
    throw new CredentialRejectedError(
      'Beisen did not return an access_token, check the connector Key and Secret',
    );
  }
  const lifetimeSeconds = response.body.expires_in ?? DEFAULT_TOKEN_LIFETIME_SECONDS;
  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + Math.max(lifetimeSeconds - TOKEN_EXPIRY_MARGIN_SECONDS, 60) * 1000,
  });
  return token;
}

async function callApi<T>(params: CallApiParams): Promise<T> {
  const { data, error } = await tryCatch(() => requestOnce<T>(params));
  if (!error) {
    return data;
  }
  if (error instanceof CredentialRejectedError) {
    throw unauthorizedError(error);
  }
  if (!(error instanceof AccessTokenRejectedError)) {
    throw error;
  }
  tokenCache.delete(tokenCacheKey({ appKey: params.auth.props.appKey, appSecret: params.auth.props.appSecret }));
  const { data: retried, error: retryError } = await tryCatch(() => requestOnce<T>(params));
  if (retryError) {
    throw retryError instanceof CredentialRejectedError || retryError instanceof AccessTokenRejectedError
      ? unauthorizedError(retryError)
      : retryError;
  }
  return retried;
}

async function requestOnce<T>({ auth, method, path, body, queryParams }: CallApiParams): Promise<T> {
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
    if (isRateLimited(error)) {
      throw rateLimitError();
    }
    if (isUnauthorized(error)) {
      throw new AccessTokenRejectedError('Beisen rejected the access token');
    }
    throw error;
  }
  assertNoGatewayError({ body: response.body, rejectsCredentials: false });
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

function isUnauthorized(error: Error): boolean {
  return error instanceof HttpError && error.response.status === HTTP_UNAUTHORIZED;
}

function unauthorizedError(cause: Error): Error {
  return new Error(
    `HTTP ${HTTP_UNAUTHORIZED}: ${cause.message}. Check that the connector Key and Secret are still valid in the Beisen admin console and that the connection uses them (Beisen credentials)`,
  );
}

function tokenCacheKey({ appKey, appSecret }: TokenParams): string {
  return `${appKey ?? ''}:${appSecret ?? ''}`;
}

function rateLimitError(): Error {
  return new Error(
    blockedUntilMarker.attach({
      message: `HTTP ${HTTP_TOO_MANY_REQUESTS}: Beisen API rate limit exceeded. Beisen stops answering this tenant for the rest of the day and allows calls again at 00:00 the next day (Beijing time), so retrying now will not help. Lower how often the workflow polls or how much history it replays (Beisen rate limit)`,
      until: nextBeijingMidnight({ now: new Date() }),
    }),
  );
}

function nextBeijingMidnight({ now }: { now: Date }): Date {
  const beijingMs = now.getTime() + BEIJING_UTC_OFFSET_MS;
  const nextMidnightBeijingMs = (Math.floor(beijingMs / MS_PER_DAY) + 1) * MS_PER_DAY;
  return new Date(nextMidnightBeijingMs - BEIJING_UTC_OFFSET_MS);
}

function assertNoGatewayError({ body, rejectsCredentials }: { body: Partial<GatewayError>; rejectsCredentials: boolean }): void {
  if (!body.error) {
    return;
  }
  if (isRateLimitMessage(body.error_description ?? body.error)) {
    throw rateLimitError();
  }
  const code = body.error_code ?? body.error;
  const description = body.error_description ?? body.error;
  const message = `${description} (Beisen error ${code})`;
  throw rejectsCredentials ? new CredentialRejectedError(message) : new Error(message);
}

const HTTP_TOO_MANY_REQUESTS = 429;

const HTTP_UNAUTHORIZED = 401;

const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
