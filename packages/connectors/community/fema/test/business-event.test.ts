import { createHmac } from 'node:crypto';

import { HttpError, HttpMethod, httpClient } from '@fema-ipaas/connector-common';
import type { HttpRequest } from '@fema-ipaas/connector-common';
import { ConnectionType, TriggerStrategy, createMockActionContext } from '@fema-ipaas/connector-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { businessEvent } from '../src/lib/triggers/business-event';
import { memoryStore } from './memory-store';

const trigger = webhookTrigger();
const webhookUrl = 'https://ipaas.example.com/api/v1/webhooks/flow-1';
const secret = 'whsec_from_fema_registration';
const auth = {
  type: ConnectionType.OAUTH2 as const,
  access_token: 'app-token',
  client_id: 'svc-t_8f2c',
  client_secret: 'secret',
  redirect_url: 'no_redirect',
  token_type: 'Bearer',
  claimed_at: 0,
  refresh_token: '',
  scope: '',
  token_url: 'https://iam.example.com/oauth2/token',
  data: {},
  props: { tokenUrl: 'https://iam.example.com/oauth2/token', apiUrl: 'https://api.example.com/', tenant: 't_8f2c' },
};

function contextFor({ store, body, headers = {}, rawBody }: { store: ReturnType<typeof memoryStore>; body: unknown; headers?: Record<string, string>; rawBody?: string }): Parameters<typeof trigger.run>[0] {
  return {
    ...createMockActionContext<typeof trigger.props>({ propsValue: { setup: undefined, events: ['rental-agreement.contract.activate'] } }),
    auth,
    store,
    webhookUrl,
    payload: { body, headers, queryParams: {}, rawBody },
  };
}

function signed({ event, key = secret }: { event: Record<string, unknown>; key?: string }): { body: unknown; rawBody: string; headers: Record<string, string> } {
  const rawBody = JSON.stringify(event);
  return { body: event, rawBody, headers: { 'X-Fema-Signature': `sha256=${createHmac('sha256', key).update(rawBody).digest('hex')}` } };
}

const event = {
  id: '732045112233',
  type: 'rental-agreement.contract.activate',
  tenantId: 't_8f2c',
  occurredAt: '2026-11-04T03:21:07Z',
  object: { code: 'contract', id: '981233' },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FEMA business event trigger', () => {
  it('is a webhook trigger that answers the verification challenge', async () => {
    expect(trigger.type).toBe(TriggerStrategy.WEBHOOK);
    const response = await trigger.onHandshake(contextFor({ store: memoryStore(), body: { type: 'webhook.verification', challenge: 'c-123' } }));
    expect(response).toEqual({ status: 200, headers: { 'Content-Type': 'application/json' }, body: { challenge: 'c-123' } });
  });

  it('registers the workflow with FEMA on enable and keeps the signing secret', async () => {
    const requests: HttpRequest[] = [];
    vi.spyOn(httpClient, 'sendRequest').mockImplementation(async (request) => {
      requests.push(request);
      return { status: 200, headers: {}, body: { code: 'SUCCESS', message: null, data: { id: 'sub-1', code: 'x', plainSecret: secret } } };
    });
    const store = memoryStore();
    await trigger.onEnable(contextFor({ store, body: {} }));
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe(HttpMethod.POST);
    expect(requests[0].url).toBe('https://api.example.com/webhook/subscription/create');
    expect(requests[0].authentication).toEqual({ type: 'BEARER_TOKEN', token: 'app-token' });
    expect(requests[0].body).toEqual({ code: expect.stringMatching(/^ipaas-[0-9a-f]{24}-[0-9a-f]{16}$/), endpoint: webhookUrl, events: ['rental-agreement.contract.activate'] });
    expect(store.snapshot()['fema_subscription']).toEqual({ id: 'sub-1', code: expect.any(String), secret, events: ['rental-agreement.contract.activate'], withheldEvents: [] });
    expect(store.snapshot()['fema_subscription_pending_code']).toBeUndefined();
  });

  it('refuses to enable when FEMA rejects the registration', async () => {
    vi.spyOn(httpClient, 'sendRequest').mockResolvedValue({ status: 200, headers: {}, body: { code: 'PERMISSION_DENIED', message: '没有读合同的权限，收不到合同生效的通知' } });
    await expect(trigger.onEnable(contextFor({ store: memoryStore(), body: {} }))).rejects.toThrow(/没有读合同的权限/);
  });

  it('refuses to enable when FEMA returns no plainSecret', async () => {
    vi.spyOn(httpClient, 'sendRequest').mockResolvedValue({ status: 200, headers: {}, body: { code: 'SUCCESS', data: { id: 'sub-1', secret: 'old-key-name' } } });
    await expect(trigger.onEnable(contextFor({ store: memoryStore(), body: {} }))).rejects.toThrow(/签名密钥/);
  });

  it('runs once per verified event and drops forged, foreign and repeated pushes', async () => {
    const store = memoryStore();
    await store.put('fema_subscription', { id: 'sub-1', code: 'ipaas-x', secret, events: ['rental-agreement.contract.activate'] });
    const first = await trigger.run(contextFor({ store, ...signed({ event }) }));
    expect(first).toEqual([{ ...event, app: 'rental-agreement', ability: 'activate', objectPath: 'rental-agreement/contract' }]);
    expect(await trigger.run(contextFor({ store, ...signed({ event }) }))).toEqual([]);
    expect(await trigger.run(contextFor({ store, ...signed({ event: { ...event, id: 'e-forged' }, key: 'wrong-secret' }) }))).toEqual([]);
    expect(await trigger.run(contextFor({ store, ...signed({ event: { ...event, id: 'e-other', tenantId: 't_other' } }) }))).toEqual([]);
    expect(await trigger.run(contextFor({ store, ...signed({ event: { ...event, id: 'e-type', type: 'billing.bill.issue' } }) }))).toEqual([]);
    expect(await trigger.run(contextFor({ store, ...signed({ event: { ...event, id: 'e-2' } }) }))).toHaveLength(1);
  });

  it('drops pushes when the workflow was never registered', async () => {
    expect(await trigger.run(contextFor({ store: memoryStore(), ...signed({ event }) }))).toEqual([]);
  });

  it('removes the registration on disable and tolerates one FEMA already forgot', async () => {
    const requests: HttpRequest[] = [];
    vi.spyOn(httpClient, 'sendRequest').mockImplementation(async (request) => {
      requests.push(request);
      return { status: 200, headers: {}, body: { code: 'NOT_FOUND', message: 'gone' } };
    });
    const store = memoryStore();
    await store.put('fema_subscription', { id: 'sub-1', code: 'ipaas-x', secret, events: [] });
    await trigger.onDisable(contextFor({ store, body: {} }));
    expect(requests[0].url).toBe('https://api.example.com/webhook/subscription/delete');
    expect(requests[0].body).toEqual({ id: 'sub-1' });
    expect(store.snapshot()['fema_subscription']).toBeUndefined();
  });

  it('uses a new code every time the workflow is turned on', async () => {
    const codes: unknown[] = [];
    vi.spyOn(httpClient, 'sendRequest').mockImplementation(async (request) => {
      codes.push(isRecord(request.body) ? request.body['code'] : null);
      return { status: 200, headers: {}, body: { code: 'SUCCESS', data: { id: `sub-${codes.length}`, plainSecret: secret } } };
    });
    await trigger.onEnable(contextFor({ store: memoryStore(), body: {} }));
    await trigger.onEnable(contextFor({ store: memoryStore(), body: {} }));
    expect(codes).toHaveLength(2);
    expect(codes[0]).not.toBe(codes[1]);
    expect(String(codes[0]).slice(0, 30)).toBe(String(codes[1]).slice(0, 30));
    expect(String(codes[0]).length).toBeLessThanOrEqual(64);
  });

  it('when the code already exists, finds it, removes it and registers again with a new code', async () => {
    const requests: HttpRequest[] = [];
    vi.spyOn(httpClient, 'sendRequest').mockImplementation(async (request) => {
      requests.push(request);
      const path = request.url.replace('https://api.example.com/', '');
      if (path === 'webhook/subscription/create' && requests.filter((entry) => entry.url.endsWith('/create')).length === 1) {
        throw new HttpError({}, { status: 409, responseBody: { code: 'ALREADY_EXISTS', message: 'duplicate code' } });
      }
      if (path === 'webhook/subscription/find-one') {
        return { status: 200, headers: {}, body: { code: 'SUCCESS', data: { id: 'sub-stale', code: 'x' } } };
      }
      if (path === 'webhook/subscription/delete') {
        return { status: 200, headers: {}, body: { code: 'SUCCESS', data: { id: 'sub-stale' } } };
      }
      return { status: 200, headers: {}, body: { code: 'SUCCESS', data: { id: 'sub-new', plainSecret: secret } } };
    });
    const store = memoryStore();
    await trigger.onEnable(contextFor({ store, body: {} }));
    const paths = requests.map((request) => request.url.replace('https://api.example.com/', ''));
    expect(paths).toEqual(['webhook/subscription/create', 'webhook/subscription/find-one', 'webhook/subscription/delete', 'webhook/subscription/create']);
    const firstCode = isRecord(requests[0].body) ? requests[0].body['code'] : null;
    expect(requests[1].body).toEqual({ filter: { code: firstCode } });
    expect(requests[2].body).toEqual({ id: 'sub-stale' });
    expect(isRecord(requests[3].body) ? requests[3].body['code'] : null).not.toBe(firstCode);
    expect(store.snapshot()['fema_subscription']).toMatchObject({ id: 'sub-new' });
  });

  it('retries with a new code after a timeout when FEMA has no record of the first one', async () => {
    const requests: HttpRequest[] = [];
    vi.spyOn(httpClient, 'sendRequest').mockImplementation(async (request) => {
      requests.push(request);
      const path = request.url.replace('https://api.example.com/', '');
      if (path === 'webhook/subscription/create' && requests.length === 1) {
        throw new Error('timeout of 20000ms exceeded');
      }
      if (path === 'webhook/subscription/find-one') {
        return { status: 200, headers: {}, body: { code: 'SUCCESS', message: null, data: null } };
      }
      return { status: 200, headers: {}, body: { code: 'SUCCESS', data: { id: 'sub-new', plainSecret: secret } } };
    });
    await trigger.onEnable(contextFor({ store: memoryStore(), body: {} }));
    expect(requests.map((request) => request.url.replace('https://api.example.com/', ''))).toEqual(['webhook/subscription/create', 'webhook/subscription/find-one', 'webhook/subscription/create']);
  });

  it('turns on with a warning when FEMA withholds some events', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(httpClient, 'sendRequest').mockResolvedValue({ status: 200, headers: {}, body: { code: 'SUCCESS', data: { id: 'sub-1', plainSecret: secret, withheldEvents: ['rental-agreement.contract.activate'] } } });
    const store = memoryStore();
    await trigger.onEnable(contextFor({ store, body: {} }));
    expect(store.snapshot()['fema_subscription']).toMatchObject({ withheldEvents: ['rental-agreement.contract.activate'] });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rental-agreement.contract.activate'));
  });

  it('cleans up a registration left behind by an interrupted enable', async () => {
    const requests: HttpRequest[] = [];
    vi.spyOn(httpClient, 'sendRequest').mockImplementation(async (request) => {
      requests.push(request);
      if (request.url.endsWith('/find-one')) {
        return { status: 200, headers: {}, body: { code: 'SUCCESS', data: { id: 'sub-orphan' } } };
      }
      return { status: 200, headers: {}, body: { code: 'SUCCESS', data: null } };
    });
    const store = memoryStore();
    await store.put('fema_subscription_pending_code', 'ipaas-pending');
    await trigger.onDisable(contextFor({ store, body: {} }));
    expect(requests.map((request) => request.body)).toEqual([{ filter: { code: 'ipaas-pending' } }, { id: 'sub-orphan' }]);
    expect(store.snapshot()['fema_subscription_pending_code']).toBeUndefined();
  });

  it('keeps the registration when FEMA fails to remove it', async () => {
    vi.spyOn(httpClient, 'sendRequest').mockResolvedValue({ status: 200, headers: {}, body: { code: 'SYSTEM_ERROR', message: 'down' } });
    const store = memoryStore();
    await store.put('fema_subscription', { id: 'sub-1', code: 'ipaas-x', secret, events: [] });
    await expect(trigger.onDisable(contextFor({ store, body: {} }))).rejects.toThrow(/SYSTEM_ERROR/);
    expect(store.snapshot()['fema_subscription']).toBeDefined();
  });
});

function webhookTrigger() {
  if (businessEvent.type !== TriggerStrategy.WEBHOOK) {
    throw new Error('FEMA business event must be a webhook trigger');
  }
  return businessEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
