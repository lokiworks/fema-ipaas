import {
  AuthenticationType,
  HttpError,
  HttpMethod,
  httpClient,
} from '@fema-ipaas/connector-common';
import { blockedUntilMarker, tryCatch, type ConnectionValueForAuthProperty } from '@fema-ipaas/connector-sdk';

import type { feishuAuth } from '../auth';
import { FEISHU_DOMAIN } from '../constants';
import { feishuErrorTable } from './error-table';

export const feishuCommon = {
  obtainTenantAccessToken,
  callApi,
  collectPages,
  describeError,
  errorCodeOf,
};

async function obtainTenantAccessToken({
  domain,
  appId,
  appSecret,
}: TokenParams): Promise<string> {
  const cacheKey = tokenCacheKey({ domain, appId, appSecret });
  const baseUrl = baseUrlFor(domain);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  const { data: response, error } = await tryCatch(() =>
    httpClient.sendRequest<TenantAccessTokenResponse>({
      method: HttpMethod.POST,
      url: `${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
      body: { app_id: appId, app_secret: appSecret },
    }),
  );
  if (error) {
    throw fromHttpError(error);
  }
  if (response.body.code !== 0) {
    throw feishuError(response.body.code, response.body.msg);
  }
  const expiresAt =
    Date.now() + Math.max(response.body.expire - TOKEN_EXPIRY_MARGIN_SECONDS, MIN_TOKEN_LIFETIME_SECONDS) * MS_PER_SECOND;
  tokenCache.set(cacheKey, {
    token: response.body.tenant_access_token,
    expiresAt,
  });
  return response.body.tenant_access_token;
}

async function callApi<T>(params: CallApiParams): Promise<T> {
  const { data, error } = await tryCatch(() => requestOnce<T>(params));
  if (!error) {
    return data;
  }
  if (!(error instanceof TokenRejectedError)) {
    throw error;
  }
  tokenCache.delete(tokenCacheKey(params.auth.props));
  return requestOnce<T>(params);
}

async function collectPages<Item>({ auth, path, queryParams, pageSize, maxItems }: CollectPagesParams): Promise<Item[]> {
  const collected: Item[] = [];
  let pageToken: string | undefined = undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result: PageResponse<Item> = await callApi<PageResponse<Item>>({
      auth,
      method: HttpMethod.GET,
      path,
      queryParams: { ...queryParams, page_size: String(pageSize), ...(pageToken ? { page_token: pageToken } : {}) },
    });
    collected.push(...(result.items ?? []));
    if (collected.length >= maxItems) {
      return collected.slice(0, maxItems);
    }
    if (!result.has_more || !result.page_token) {
      return collected;
    }
    pageToken = result.page_token;
  }
  return collected;
}

async function requestOnce<T>({
  auth,
  method,
  path,
  body,
  queryParams,
}: CallApiParams): Promise<T> {
  const token = await obtainTenantAccessToken(auth.props);
  const { data: response, error } = await tryCatch(() =>
    httpClient.sendRequest<FeishuEnvelope<T>>({
      method,
      url: `${baseUrlFor(auth.props.domain)}${path}`,
      authentication: { type: AuthenticationType.BEARER_TOKEN, token },
      ...(body ? { body } : {}),
      ...(queryParams ? { queryParams } : {}),
    }),
  );
  if (error) {
    throw fromHttpError(error);
  }
  if (response.body.code !== 0) {
    throw feishuError(response.body.code, response.body.msg, rateLimitResetSeconds(response.headers ?? {}));
  }
  return response.body.data;
}

function baseUrlFor(domain: string | undefined): string {
  return process.env['FEMA_FEISHU_BASE_URL'] ?? domain ?? FEISHU_DOMAIN;
}

function fromHttpError(error: Error): Error {
  if (!(error instanceof HttpError)) {
    return error;
  }
  const body = error.response.body;
  const resetSeconds = rateLimitResetSeconds(error.responseHeaders);
  if (isFeishuErrorBody(body)) {
    return feishuError(body.code, body.msg, resetSeconds);
  }
  if (error.response.status === HTTP_TOO_MANY_REQUESTS) {
    return feishuError(GATEWAY_RATE_LIMIT_CODE, 'request trigger frequency limit', resetSeconds);
  }
  return error;
}

function rateLimitResetSeconds(headers: Record<string, string | string[] | undefined>): number | undefined {
  const raw = headers[RATE_LIMIT_RESET_HEADER];
  const seconds = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function feishuError(code: number, message: string, resetSeconds?: number): Error {
  const rule = feishuErrorTable.ruleFor({ code });
  const described = describeError(code, message);
  const plain = rule?.status ? `HTTP ${rule.status}: ${described}` : described;
  if (rule?.kind === 'RATE_LIMIT') {
    return new Error(
      blockedUntilMarker.attach({
        message: plain,
        until: new Date(Date.now() + (resetSeconds ?? DEFAULT_RATE_LIMIT_WAIT_SECONDS) * MS_PER_SECOND),
      }),
    );
  }
  if (rule?.kind === 'MONTHLY_QUOTA') {
    return new Error(
      blockedUntilMarker.attach({ message: plain, until: feishuErrorTable.nextMonthStartInBeijing({ now: new Date() }) }),
    );
  }
  return rule?.kind === 'TOKEN_REJECTED' ? new TokenRejectedError(plain) : new Error(plain);
}

function errorCodeOf(error: Error): number | undefined {
  const match = FEISHU_CODE_PATTERN.exec(error.message);
  return match ? Number(match[1]) : undefined;
}

function tokenCacheKey({ domain, appId, appSecret }: TokenParams): string {
  return `${baseUrlFor(domain)}:${appId}:${appSecret}`;
}

function isFeishuErrorBody(body: unknown): body is { code: number; msg: string } {
  return typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'number' && 'msg' in body && typeof body.msg === 'string';
}

function describeError(code: number, message: string): string {
  const hint = feishuErrorTable.ruleFor({ code })?.hint;
  return hint ? `${message} — ${hint} (Feishu error ${code})` : `${message} (Feishu error ${code})`;
}

const TOKEN_EXPIRY_MARGIN_SECONDS = 300;

const MIN_TOKEN_LIFETIME_SECONDS = 60;

const HTTP_TOO_MANY_REQUESTS = 429;

const GATEWAY_RATE_LIMIT_CODE = 99991400;

const RATE_LIMIT_RESET_HEADER = 'x-ogw-ratelimit-reset';

const DEFAULT_RATE_LIMIT_WAIT_SECONDS = 1;

const MS_PER_SECOND = 1000;

const MAX_PAGES = 400;

const FEISHU_CODE_PATTERN = /\(Feishu error (\d+)\)/;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

class TokenRejectedError extends Error {}

export type FeishuAuthValue = ConnectionValueForAuthProperty<typeof feishuAuth>;

type TokenParams = {
  domain?: string;
  appId?: string;
  appSecret?: string;
};

type TenantAccessTokenResponse = {
  code: number;
  msg: string;
  tenant_access_token: string;
  expire: number;
};

type FeishuEnvelope<T> = { code: number; msg: string; data: T };

type PageResponse<Item> = { items?: Item[]; has_more?: boolean; page_token?: string };

type CallApiParams = {
  auth: FeishuAuthValue;
  method: HttpMethod;
  path: string;
  body?: unknown;
  queryParams?: Record<string, string>;
};

type CollectPagesParams = {
  auth: FeishuAuthValue;
  path: string;
  queryParams: Record<string, string>;
  pageSize: number;
  maxItems: number;
};
