import type { RateLimitContext } from '@fema-ipaas/connector-sdk';
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
  isSuccessCode,
  businessError,
  chunk,
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
    timeout: REQUEST_TIMEOUT_MS,
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

async function requestOnce<T>({ auth, rateLimit, method, path, body, queryParams }: CallApiParams): Promise<T> {
  await rateLimit?.acquire({ bucket: 'beisen-api', scopeKey: 'tenant' });
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
      timeout: REQUEST_TIMEOUT_MS,
    }),
  );
  if (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw withReadable({
        error: new Error(`Beisen did not answer ${path} within ${REQUEST_TIMEOUT_MS / MS_PER_SECOND} seconds`),
        readableMessage: `北森在 ${REQUEST_TIMEOUT_MS / MS_PER_SECOND} 秒内没有响应，请稍后重试`,
      });
    }
    if (isRateLimited(error)) {
      throw rateLimitError({ retryAfterSeconds: retryAfterSecondsOf(error) });
    }
    if (isUnauthorized(error)) {
      throw new AccessTokenRejectedError('Beisen rejected the access token');
    }
    throw error;
  }
  assertNoGatewayError({ body: response.body, rejectsCredentials: false });
  return response.body;
}

async function callBusinessApi<T>(params: CallApiParams): Promise<T | null> {
  const body = await callApi<BusinessEnvelope<T>>(params);
  if (body.code !== undefined && !isSuccessCode(body.code)) {
    throw businessError({ code: body.code, message: body.message });
  }
  if (body.data === undefined) {
    if (body.code === undefined) {
      throw businessError({ code: undefined, message: body.message ?? 'Beisen returned no data for this request' });
    }
    return null;
  }
  return body.data;
}

function isSuccessCode(code: unknown): boolean {
  const numeric = Number(code);
  return Number.isFinite(numeric) && numeric < FIRST_ERROR_CODE;
}

function businessError({ code, message }: { code: unknown; message: string | undefined }): Error {
  const text = message && message.length > 0 ? message : 'Beisen rejected the request';
  const hasCode = code !== undefined && code !== null;
  return withReadable({
    error: new Error(hasCode ? `${text} (Beisen code ${String(code)})` : text),
    readableMessage: hasCode ? `北森接口返回错误：${text}（北森错误码 ${String(code)}）` : `北森接口返回错误：${text}`,
  });
}

function chunk<Item>({ items, size }: { items: Item[]; size: number }): Item[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function isRateLimited(error: Error): error is HttpError {
  return error instanceof HttpError && error.response.status === HTTP_TOO_MANY_REQUESTS;
}

function isUnauthorized(error: Error): boolean {
  return error instanceof HttpError && error.response.status === HTTP_UNAUTHORIZED;
}

function unauthorizedError(cause: Error): Error {
  return withReadable({
    error: new Error(
      `HTTP ${HTTP_UNAUTHORIZED}: ${cause.message}. Check that the connector Key and Secret are still valid in the Beisen admin console and that the connection uses them (Beisen credentials)`,
    ),
    readableMessage: '北森拒绝了连接凭证，请在北森管理后台确认连接器 Key 和 Secret 仍然有效，并且连接里填的是它们',
  });
}

function withReadable({ error, readableMessage }: { error: Error; readableMessage: string }): Error {
  return Object.assign(error, { readableMessage });
}

function tokenCacheKey({ appKey, appSecret }: TokenParams): string {
  return `${appKey ?? ''}:${appSecret ?? ''}`;
}

function rateLimitError({ retryAfterSeconds }: { retryAfterSeconds?: number } = {}): Error {
  if (retryAfterSeconds !== undefined) {
    return withReadable({
      error: new Error(
        blockedUntilMarker.attach({
          message: `HTTP ${HTTP_TOO_MANY_REQUESTS}: Beisen API rate limit exceeded. Beisen asked the caller to wait before the next call (Beisen retry-after)`,
          until: new Date(Date.now() + retryAfterSeconds * MS_PER_SECOND),
        }),
      ),
      readableMessage: `北森接口调用超过频率限制，需要等待 ${retryAfterSeconds} 秒后再调用`,
    });
  }
  return withReadable({ error: new Error(
    blockedUntilMarker.attach({
      message: `HTTP ${HTTP_TOO_MANY_REQUESTS}: Beisen API rate limit exceeded. Beisen stops answering this tenant for the rest of the day and allows calls again at 00:00 the next day (Beijing time), so retrying now will not help. Lower how often the workflow polls or how much history it replays (Beisen rate limit)`,
      until: nextBeijingMidnight({ now: new Date() }),
    }),
  ), readableMessage: '北森接口今日调用次数已达上限，北森次日 0 点（北京时间）才恢复，现在重试无效；请降低轮询频率或回放的历史数据量' });
}

function retryAfterSecondsOf(error: HttpError): number | undefined {
  const raw = error.responseHeaders['retry-after'];
  const seconds = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
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
  const readableMessage = `北森接口返回错误：${description}（北森错误码 ${code}）`;
  throw withReadable({ error: rejectsCredentials ? new CredentialRejectedError(message) : new Error(message), readableMessage });
}

const FIRST_ERROR_CODE = 400;

const HTTP_TOO_MANY_REQUESTS = 429;

const HTTP_UNAUTHORIZED = 401;

const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MS_PER_SECOND = 1000;

const REQUEST_TIMEOUT_MS = 30_000;

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

type BusinessEnvelope<T> = { data?: T | null; code?: number | string; message?: string };

type CallApiParams = {
  auth: BeisenAuthValue;
  rateLimit?: RateLimitContext;
  method: HttpMethod;
  path: string;
  body?: unknown;
  queryParams?: Record<string, string>;
};
