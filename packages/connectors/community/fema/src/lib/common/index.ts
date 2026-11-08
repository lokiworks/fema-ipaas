import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { AuthenticationType, HttpError, HttpMethod, httpClient } from '@fema-ipaas/connector-common';
import { isObject, tryCatch, tryCatchSync } from '@fema-ipaas/connector-sdk';
import type { ConnectionValueForAuthProperty, Store } from '@fema-ipaas/connector-sdk';

import type { femaAuth } from '../auth';

async function call({ auth, method, path, queryParams, body }: CallParams): Promise<unknown> {
  const url = `${apiBase({ auth })}/${trimSlashes({ value: path })}`;
  const { data, error } = await tryCatch(() =>
    httpClient.sendRequest<unknown>({
      method,
      url,
      authentication: { type: AuthenticationType.BEARER_TOKEN, token: auth.access_token },
      headers: { accept: 'application/json' },
      ...(queryParams && Object.keys(queryParams).length > 0 ? { queryParams } : {}),
      ...(body === undefined ? {} : { body }),
      timeout: REQUEST_TIMEOUT_MS,
    }),
  );
  if (error) {
    throw readableError({ error, path });
  }
  return unwrap({ body: data.body, path });
}

function unwrap({ body, path }: { body: unknown; path: string }): unknown {
  if (!isEnvelope(body)) {
    return body;
  }
  if (body.code !== SUCCESS_CODE) {
    throw new FemaApiError({ path, status: 200, code: body.code, message: typeof body.message === 'string' ? body.message : null });
  }
  return body.data ?? null;
}

function isEnvelope(body: unknown): body is { code: string; message?: unknown; data?: unknown } {
  return isObject(body) && typeof body['code'] === 'string' && ('data' in body || 'message' in body);
}

function readableError({ error, path }: { error: unknown; path: string }): Error {
  if (!(error instanceof HttpError)) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const responseBody = error.response.body;
  const code = isObject(responseBody) && typeof responseBody['code'] === 'string' ? responseBody['code'] : null;
  const message = isObject(responseBody) && typeof responseBody['message'] === 'string' ? responseBody['message'] : null;
  return new FemaApiError({ path, status: error.response.status, code, message });
}

function apiBase({ auth }: { auth: FemaConnection }): string {
  const apiUrl = auth.props?.['apiUrl'];
  if (typeof apiUrl === 'string' && apiUrl.trim().length > 0) {
    return apiUrl.trim().replace(/\/+$/, '');
  }
  const { data: origin } = tryCatchSync(() => new URL(auth.token_url).origin);
  if (origin) {
    return origin;
  }
  throw new Error('连接里没有填写 FEMA 接口地址（API URL），请编辑连接补上');
}

function trimSlashes({ value }: { value: string }): string {
  return value.trim().replace(/^\/+/, '');
}

function subscriptionCode({ webhookUrl }: { webhookUrl: string }): string {
  return `ipaas-${createHash('sha256').update(webhookUrl).digest('hex').slice(0, 24)}-${randomBytes(8).toString('hex')}`;
}

function sign({ secret, payload }: { secret: string; payload: string }): string {
  return `${SIGNATURE_PREFIX}${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

function verifySignature({ secret, signature, rawBody, body }: VerifySignatureParams): boolean {
  if (typeof signature !== 'string' || !signature.startsWith(SIGNATURE_PREFIX) || secret.length === 0) {
    return false;
  }
  const payload = signedPayloadOf({ rawBody, body });
  if (payload === null) {
    return false;
  }
  const expected = Buffer.from(sign({ secret, payload }));
  const actual = Buffer.from(signature.trim().toLowerCase());
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function signedPayloadOf({ rawBody, body }: { rawBody: unknown; body: unknown }): string | null {
  if (typeof rawBody === 'string') {
    return rawBody;
  }
  if (Buffer.isBuffer(rawBody)) {
    return rawBody.toString('utf8');
  }
  if (body === undefined || body === null) {
    return null;
  }
  return typeof body === 'string' ? body : JSON.stringify(body);
}

function headerOf({ headers, name }: { headers: Record<string, string> | undefined; name: string }): string | undefined {
  if (!headers) {
    return undefined;
  }
  const wanted = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === wanted);
  return entry?.[1];
}

function parseEvent({ body }: { body: unknown }): FemaEvent | null {
  const parsed = typeof body === 'string' ? parseJson({ text: body }) : body;
  if (!isObject(parsed) || typeof parsed['id'] !== 'string' && typeof parsed['id'] !== 'number' || typeof parsed['type'] !== 'string') {
    return null;
  }
  const object = isObject(parsed['object']) ? parsed['object'] : {};
  return {
    id: String(parsed['id']),
    type: parsed['type'],
    tenantId: typeof parsed['tenantId'] === 'string' ? parsed['tenantId'] : null,
    occurredAt: typeof parsed['occurredAt'] === 'string' ? parsed['occurredAt'] : null,
    object: {
      code: stringOrNull({ value: object['code'] }),
      id: stringOrNull({ value: object['id'] }),
    },
  };
}

function parseJson({ text }: { text: string }): unknown {
  try {
    return JSON.parse(text);
  }
  catch {
    return null;
  }
}

function stringOrNull({ value }: { value: unknown }): string | null {
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' ? String(value) : null;
}

function appOf({ eventType }: { eventType: string }): string | null {
  const parts = eventType.split('.');
  return parts.length >= 3 && parts[0].length > 0 ? parts[0] : null;
}

function objectPathOf({ event }: { event: FemaEvent }): string | null {
  const parts = event.type.split('.');
  const app = appOf({ eventType: event.type });
  const object = event.object.code ?? (parts.length >= 3 ? parts[1] : null);
  return app && object ? `${app}/${object}` : null;
}

function flatten({ event }: { event: FemaEvent }): FlatFemaEvent {
  return {
    id: event.id,
    type: event.type,
    tenantId: event.tenantId,
    occurredAt: event.occurredAt,
    app: appOf({ eventType: event.type }),
    ability: event.type.split('.').slice(2).join('.') || null,
    object: event.object,
    objectPath: objectPathOf({ event }),
  };
}

function matchesEvents({ type, events }: { type: string; events: string[] }): boolean {
  return events.length === 0 || events.includes(type);
}

function normalizeEvents({ events }: { events: unknown }): string[] {
  if (!Array.isArray(events)) {
    return [];
  }
  return [...new Set(events.map((event) => String(event).trim()).filter((event) => event.length > 0))];
}

async function rememberEvent({ store, id, now }: RememberEventParams): Promise<boolean> {
  const seen = (await store.get<SeenEvent[]>(SEEN_EVENTS_KEY)) ?? [];
  const recent = seen.filter((entry) => now - entry.at < DEDUPE_WINDOW_MS);
  if (recent.some((entry) => entry.id === id)) {
    return false;
  }
  await store.put<SeenEvent[]>(SEEN_EVENTS_KEY, [...recent, { id, at: now }].slice(-MAX_SEEN_EVENTS));
  return true;
}

class FemaApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor({ path, status, code, message }: { path: string; status: number; code: string | null; message: string | null }) {
    super(`FEMA 接口 ${path} 调用失败（HTTP ${status}${code ? `，${code}` : ''}）${message ? `：${message}` : ''}`);
    this.status = status;
    this.code = code;
  }
}

const REQUEST_TIMEOUT_MS = 20000;
const SUCCESS_CODE = 'SUCCESS';
const SIGNATURE_PREFIX = 'sha256=';
const SEEN_EVENTS_KEY = 'fema_seen_event_ids';
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_SEEN_EVENTS = 2000;

export const femaCommon = {
  call,
  unwrap,
  subscriptionCode,
  sign,
  verifySignature,
  headerOf,
  parseEvent,
  flatten,
  objectPathOf,
  matchesEvents,
  normalizeEvents,
  rememberEvent,
  FemaApiError,
};

export const FEMA_SIGNATURE_HEADER = 'x-fema-signature';
export const FEMA_SECRET_STORE_KEY = 'fema_subscription';
export const FEMA_PENDING_CODE_KEY = 'fema_subscription_pending_code';

export type FemaConnection = ConnectionValueForAuthProperty<typeof femaAuth>;

export type FemaEvent = {
  id: string;
  type: string;
  tenantId: string | null;
  occurredAt: string | null;
  object: { code: string | null; id: string | null };
};

export type FlatFemaEvent = FemaEvent & {
  app: string | null;
  ability: string | null;
  objectPath: string | null;
};

export type FemaSubscription = {
  id: string | null;
  code: string;
  secret: string;
  events: string[];
  withheldEvents: string[];
};

type CallParams = {
  auth: FemaConnection;
  method: HttpMethod;
  path: string;
  queryParams?: Record<string, string>;
  body?: unknown;
};

type VerifySignatureParams = {
  secret: string;
  signature: string | undefined;
  rawBody: unknown;
  body: unknown;
};

type RememberEventParams = {
  store: Store;
  id: string;
  now: number;
};

type SeenEvent = { id: string; at: number };
