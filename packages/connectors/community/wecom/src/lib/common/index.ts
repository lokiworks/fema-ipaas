import { createHash } from 'node:crypto';
import { httpClient, HttpMethod } from '@fema-ipaas/connector-common';
import { fixOwnerMarker, isObject, RateLimitContext, tryCatch } from '@fema-ipaas/connector-sdk';
import { wecomErrorTable, WecomError } from './error-table';

async function obtainAccessToken({ auth, purpose }: { auth: WecomCredentials; purpose: Purpose }): Promise<string> {
  const secret = purpose === 'contact' ? auth.contactSecret : auth.appSecret;
  if (!secret) throw new Error(fixOwnerMarker.attach({ message: `Configure the ${purpose === 'contact' ? 'contact synchronization' : 'application'} secret for this operation.`, owner: 'CONNECTION_OWNER' }));
  const key = createHash('sha256').update(JSON.stringify([baseUrl(), auth.corpId, secret])).digest('hex');
  const cached = tokens.get(key);
  if (cached && cached.expires > Date.now()) return cached.token;
  const response = await httpClient.sendRequest<{ errcode?: number; errmsg?: string; access_token?: string; expires_in?: number }>({ method: HttpMethod.GET, url: `${baseUrl()}/cgi-bin/gettoken`, queryParams: { corpid: auth.corpId, corpsecret: secret }, timeout: 30000 });
  if (response.body.errcode || !response.body.access_token) throw wecomErrorTable.error({ code: response.body.errcode ?? -1 });
  const token = response.body.access_token;
  tokens.set(key, { token, expires: Date.now() + Math.max(1, (response.body.expires_in ?? 7200) - 300) * 1000 });
  return token;
}

async function callApi({ auth, purpose = 'app', path, method = HttpMethod.GET, body, query, write = false, rateLimit, refreshed = false }: ApiParams): Promise<Record<string, unknown>> {
  await rateLimit?.acquire({ bucket: write ? 'wecom-write' : 'wecom-read', scopeKey: `${auth.corpId}:${purpose}` });
  const token = await obtainAccessToken({ auth, purpose });
  const { data: response, error } = await tryCatch(() => httpClient.sendRequest({ method, url: `${baseUrl()}${path}`, queryParams: { ...query, access_token: token }, body, timeout: 30000 }));
  if (error) throw new Error(fixOwnerMarker.attach({ message: write ? 'WeCom request failed. The write may already have taken effect; read the target before writing again.' : 'WeCom request failed. Check connectivity and API availability.', owner: 'TARGET_ADMIN' }));
  if (!isObject(response.body)) throw new Error('WeCom returned an invalid response');
  const code = response.body['errcode'];
  if (typeof code !== 'number') throw new Error('WeCom returned no error code');
  if ([40014, 42001].includes(code) && !refreshed) {
    const secret = purpose === 'contact' ? auth.contactSecret : auth.appSecret;
    tokens.delete(createHash('sha256').update(JSON.stringify([baseUrl(), auth.corpId, secret])).digest('hex'));
    return callApi({ auth, purpose, path, method, body, query, write, rateLimit, refreshed: true });
  }
  if (code !== 0) throw wecomErrorTable.error({ code });
  return response.body;
}

function baseUrl(): string { return (process.env['FEMA_WECOM_BASE_URL'] ?? 'https://qyapi.weixin.qq.com').replace(/\/$/, ''); }
function missing(error: unknown): boolean { return error instanceof WecomError && [60111, 60146, 60147].includes(error.code); }

const tokens = new Map<string, { token: string; expires: number }>();

export const wecomCommon = { obtainAccessToken, callApi, missing, baseUrl };
export type WecomCredentials = { corpId: string; contactSecret?: string; appSecret?: string; agentId?: string; robotKey?: string };
export type WecomRuntime = { auth: WecomCredentials; rateLimit?: RateLimitContext };
type Purpose = 'contact' | 'app';
type ApiParams = WecomRuntime & { purpose?: Purpose; path: string; method?: HttpMethod; body?: Record<string, unknown>; query?: Record<string, string>; write?: boolean; refreshed?: boolean };
