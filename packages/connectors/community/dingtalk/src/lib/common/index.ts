import { createHash } from 'node:crypto';
import { httpClient, HttpError, HttpMethod } from '@fema-ipaas/connector-common';
import { fixOwnerMarker, isObject, RateLimitContext, tryCatch } from '@fema-ipaas/connector-sdk';
import { dingtalkErrorTable, DingtalkError } from './error-table';

async function obtainAccessToken(auth: DingtalkCredentials): Promise<string> {
  const key = cacheKey(auth);
  const cached = tokens.get(key);
  if (cached && cached.expires > Date.now()) return cached.token;
  const { data: response, error } = await tryCatch(() => httpClient.sendRequest({ method: HttpMethod.POST, url: `${baseUrl({ modern: true })}/v1.0/oauth2/accessToken`, body: { appKey: auth.appKey, appSecret: auth.appSecret }, timeout: 30000 }));
  if (error) throw fromError({ error, write: false });
  if (!isObject(response.body) || typeof response.body['accessToken'] !== 'string') throw dingtalkErrorTable.error(codeOf(response.body));
  tokens.set(key, { token: response.body['accessToken'], expires: Date.now() + Math.max(1, Number(response.body['expireIn'] ?? 7200) - 300) * 1000 });
  return response.body['accessToken'];
}

async function callApi({ auth, path, body, write = false, rateLimit, refreshed = false }: ApiParams): Promise<Record<string, unknown>> {
  await rateLimit?.acquire({ bucket: write ? 'dingtalk-write' : 'dingtalk-read', scopeKey: auth.appKey });
  const accessToken = await obtainAccessToken(auth);
  const { data: response, error } = await tryCatch(() => httpClient.sendRequest({ method: HttpMethod.POST, url: `${baseUrl({ modern: false })}${path}`, queryParams: { access_token: accessToken }, body, timeout: 30000 }));
  if (error) throw fromError({ error, write });
  const code = codeOf(response.body);
  if (['40014', '42001', 'InvalidAuthentication'].includes(code) && !refreshed) { tokens.delete(cacheKey(auth)); return callApi({ auth, path, body, write, rateLimit, refreshed: true }); }
  if (code !== '0') throw dingtalkErrorTable.error(code);
  if (!isObject(response.body)) throw new Error('Invalid DingTalk response');
  const result = response.body['result'];
  return isObject(result) ? result : response.body;
}

function codeOf(body: unknown): string { if (!isObject(body)) return 'UNKNOWN'; const sub = body['sub_code'] ?? body['subCode']; return String(sub ?? body['errcode'] ?? body['code'] ?? 'UNKNOWN'); }
function fromError({ error, write }: { error: Error; write: boolean }): Error {
  if (error instanceof HttpError) { const code = codeOf(error.response.body); if (code !== 'UNKNOWN') return dingtalkErrorTable.error(code); if (error.response.status === 429) return dingtalkErrorTable.error('Throttling'); }
  return new Error(fixOwnerMarker.attach({ message: write ? 'DingTalk request failed. The write may already have taken effect; read the target before writing again.' : 'DingTalk request failed. Check connectivity and application access.', owner: 'TARGET_ADMIN' }));
}
function baseUrl({ modern }: { modern: boolean }): string { return (process.env['FEMA_DINGTALK_BASE_URL'] ?? (modern ? 'https://api.dingtalk.com' : 'https://oapi.dingtalk.com')).replace(/\/$/, ''); }
function cacheKey(auth: DingtalkCredentials): string { return createHash('sha256').update(JSON.stringify([baseUrl({ modern: true }), auth.appKey, auth.appSecret])).digest('hex'); }
function missing(error: unknown): boolean { return error instanceof DingtalkError && error.code === '60121'; }

const tokens = new Map<string, { token: string; expires: number }>();
export const dingtalkCommon = { obtainAccessToken, callApi, baseUrl, missing, codeOf };
export type DingtalkCredentials = { appKey: string; appSecret: string; agentId?: string; robotToken?: string; robotSecret?: string };
export type DingtalkRuntime = { auth: DingtalkCredentials; rateLimit?: RateLimitContext };
type ApiParams = DingtalkRuntime & { path: string; body: Record<string, unknown>; write?: boolean; refreshed?: boolean };
