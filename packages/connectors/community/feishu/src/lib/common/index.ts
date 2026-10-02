import {
  AuthenticationType,
  HttpError,
  HttpMethod,
  httpClient,
} from '@fema-ipaas/connector-common';
import { tryCatch, type ConnectionValueForAuthProperty } from '@fema-ipaas/connector-sdk';

import type { feishuAuth } from '../auth';
import { FEISHU_DOMAIN } from '../constants';

export const feishuCommon = {
  obtainTenantAccessToken,
  callApi,
  describeError,
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
  const response = await httpClient.sendRequest<TenantAccessTokenResponse>({
    method: HttpMethod.POST,
    url: `${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
    body: { app_id: appId, app_secret: appSecret },
  });
  if (response.body.code !== 0) {
    throw new Error(describeError(response.body.code, response.body.msg));
  }
  const expiresAt =
    Date.now() + (response.body.expire - TOKEN_EXPIRY_MARGIN_SECONDS) * 1000;
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
    throw feishuError(response.body.code, response.body.msg);
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
  return isFeishuErrorBody(body) ? feishuError(body.code, body.msg) : error;
}

function feishuError(code: number, message: string): Error {
  const status = HTTP_STATUS_BY_CODE[code];
  const described = describeError(code, message);
  const text = status ? `HTTP ${status}: ${described}` : described;
  return TOKEN_REJECTED_CODES.includes(code) ? new TokenRejectedError(text) : new Error(text);
}

function tokenCacheKey({ domain, appId, appSecret }: TokenParams): string {
  return `${baseUrlFor(domain)}:${appId}:${appSecret}`;
}

function isFeishuErrorBody(body: unknown): body is { code: number; msg: string } {
  return typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'number' && 'msg' in body && typeof body.msg === 'string';
}

function describeError(code: number, message: string): string {
  const hint = ERROR_HINTS[code];
  return hint ? `${message} — ${hint} (Feishu error ${code})` : `${message} (Feishu error ${code})`;
}

const TOKEN_EXPIRY_MARGIN_SECONDS = 300;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

class TokenRejectedError extends Error {}

const TOKEN_REJECTED_CODES = [99991663, 99991664];

const HTTP_STATUS_BY_CODE: Record<number, number> = {
  99991663: 401,
  99991664: 401,
  99991672: 403,
  99991400: 429,
  44025: 429,
  230002: 403,
  40004: 403,
  41050: 403,
};

const ERROR_HINTS: Record<number, string> = {
  99991663: 'the app credentials are not valid, check the App ID and App Secret',
  99991664: 'the tenant access token expired, retry the step',
  99991400: 'the app is calling this endpoint too fast, slow down and retry',
  40004: 'the department is outside the contact scope of the app, add it to the app permission scope in the Open Platform and republish the app',
  41050: 'the member is outside the contact scope of the app, add the member or their department to the app permission scope in the Open Platform and republish the app',
  44025: 'Feishu is still processing another change to the contact directory, retry in a few seconds',
  99991672: 'the app is missing the permission this endpoint needs, grant it in the Open Platform and republish the app',
  230001: 'the recipient does not exist, check the email or user ID',
  230002: 'the bot is not in that chat, add the app to the chat first',
  1254005: 'that Bitable record does not exist',
  1254404: 'that Bitable or data table does not exist, check the App Token and data table',
};

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

type CallApiParams = {
  auth: FeishuAuthValue;
  method: HttpMethod;
  path: string;
  body?: unknown;
  queryParams?: Record<string, string>;
};
