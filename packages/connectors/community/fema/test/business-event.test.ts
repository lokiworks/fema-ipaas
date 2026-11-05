import { createHmac } from 'node:crypto';

import { HttpMethod, httpClient } from '@fema-ipaas/connector-common';
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
  object: { code: 'contract', id: '981233', businessKey: 'HT-2026-0001' },
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
      return { status: 200, headers: {}, body: { code: 'SUCCESS', message: null, data: { id: 'sub-1', code: 'x', secret } } };
    });
    const store = memoryStore();
    await trigger.onEnable(contextFor({ store, body: {} }));
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe(HttpMethod.POST);
    expect(requests[0].url).toBe('https://api.example.com/webhook/subscription/create');
    expect(requests[0].authentication).toEqual({ type: 'BEARER_TOKEN', token: 'app-token' });
    expect(requests[0].body).toEqual({ code: expect.stringMatching(/^ipaas-[0-9a-f]{24}$/), endpoint: webhookUrl, events: ['rental-agreement.contract.activate'] });
    expect(store.snapshot()['fema_subscription']).toEqual({ id: 'sub-1', code: expect.any(String), secret, events: ['rental-agreement.contract.activate'] });
  });

  it('refuses to enable when FEMA rejects the registration', async () => {
    vi.spyOn(httpClient, 'sendRequest').mockResolvedValue({ status: 200, headers: {}, body: { code: 'PERMISSION_DENIED', message: '没有读合同的权限，收不到合同生效的通知' } });
    await expect(trigger.onEnable(contextFor({ store: memoryStore(), body: {} }))).rejects.toThrow(/没有读合同的权限/);
  });

  it('refuses to enable when FEMA returns no signing secret', async () => {
    vi.spyOn(httpClient, 'sendRequest').mockResolvedValue({ status: 200, headers: {}, body: { code: 'SUCCESS', data: { id: 'sub-1' } } });
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
    expect(requests[0].body).toEqual({ id: 'sub-1', code: 'ipaas-x' });
    expect(store.snapshot()['fema_subscription']).toBeUndefined();
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
