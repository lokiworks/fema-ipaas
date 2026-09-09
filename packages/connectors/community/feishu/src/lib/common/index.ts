import {
  AuthenticationType,
  HttpMethod,
  httpClient,
} from '@fema-ipaas/connector-common';
import type { ConnectionValueForAuthProperty } from '@fema-ipaas/connector-sdk';

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
  const baseUrl = domain ?? FEISHU_DOMAIN;
  const cacheKey = `${baseUrl}:${appId}:${appSecret}`;
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

async function callApi<T>({
  auth,
  method,
  path,
  body,
  queryParams,
}: CallApiParams): Promise<T> {
  const token = await obtainTenantAccessToken(auth.props);
  const response = await httpClient.sendRequest<FeishuEnvelope<T>>({
    method,
    url: `${auth.props.domain ?? FEISHU_DOMAIN}${path}`,
    authentication: { type: AuthenticationType.BEARER_TOKEN, token },
    ...(body ? { body } : {}),
    ...(queryParams ? { queryParams } : {}),
  });
  if (response.body.code !== 0) {
    throw new Error(describeError(response.body.code, response.body.msg));
  }
  return response.body.data;
}

function describeError(code: number, message: string): string {
  const hint = ERROR_HINTS[code];
  return hint ? `${message} — ${hint} (Feishu error ${code})` : `${message} (Feishu error ${code})`;
}

const TOKEN_EXPIRY_MARGIN_SECONDS = 300;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

const ERROR_HINTS: Record<number, string> = {
  99991663: 'the app credentials are not valid, check the App ID and App Secret',
  99991664: 'the tenant access token expired, retry the step',
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
