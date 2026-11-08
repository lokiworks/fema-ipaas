import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { femaCommon } from '../src/lib/common';
import { memoryStore } from './memory-store';

const secret = 'whsec_test_secret_value';
const event = {
  id: '732045112233',
  type: 'rental-agreement.contract.activate',
  tenantId: 't_8f2c',
  occurredAt: '2026-11-04T03:21:07Z',
  object: { code: 'contract', id: '981233' },
};
const rawBody = JSON.stringify(event);
const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

describe('femaCommon.verifySignature', () => {
  it('accepts the HMAC-SHA256 of the raw body', () => {
    expect(femaCommon.verifySignature({ secret, signature, rawBody, body: event })).toBe(true);
  });

  it('accepts an upper-case hex digest', () => {
    expect(femaCommon.verifySignature({ secret, signature: `sha256=${signature.slice(7).toUpperCase()}`, rawBody, body: event })).toBe(true);
  });

  it('falls back to the serialized body when the raw body is missing', () => {
    expect(femaCommon.verifySignature({ secret, signature, rawBody: undefined, body: event })).toBe(true);
  });

  it('rejects a body that was changed after signing', () => {
    expect(femaCommon.verifySignature({ secret, signature, rawBody: rawBody.replace('981233', '981234'), body: event })).toBe(false);
  });

  it('rejects another secret, a missing header and a missing prefix', () => {
    expect(femaCommon.verifySignature({ secret: 'other-secret-value', signature, rawBody, body: event })).toBe(false);
    expect(femaCommon.verifySignature({ secret, signature: undefined, rawBody, body: event })).toBe(false);
    expect(femaCommon.verifySignature({ secret, signature: signature.slice(7), rawBody, body: event })).toBe(false);
    expect(femaCommon.verifySignature({ secret: '', signature, rawBody, body: event })).toBe(false);
  });

  it('signs in the same format FEMA verifies', () => {
    expect(femaCommon.sign({ secret, payload: rawBody })).toBe(signature);
  });
});

describe('femaCommon events', () => {
  it('parses a push and derives the object path', () => {
    const parsed = femaCommon.parseEvent({ body: event });
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(femaCommon.flatten({ event: parsed })).toEqual({
      ...event,
      app: 'rental-agreement',
      ability: 'activate',
      objectPath: 'rental-agreement/contract',
    });
  });

  it('parses a push delivered as a JSON string', () => {
    expect(femaCommon.parseEvent({ body: rawBody })?.id).toBe(event.id);
  });

  it('accepts a numeric event id and rejects payloads without id or type', () => {
    expect(femaCommon.parseEvent({ body: { ...event, id: 42 } })?.id).toBe('42');
    expect(femaCommon.parseEvent({ body: { type: event.type } })).toBeNull();
    expect(femaCommon.parseEvent({ body: { id: '1' } })).toBeNull();
    expect(femaCommon.parseEvent({ body: 'not json' })).toBeNull();
  });

  it('falls back to the type when the push has no object code', () => {
    const parsed = femaCommon.parseEvent({ body: { ...event, object: { id: '1' } } });
    if (!parsed) throw new Error('expected an event');
    expect(femaCommon.objectPathOf({ event: parsed })).toBe('rental-agreement/contract');
  });

  it('normalizes the configured event types', () => {
    expect(femaCommon.normalizeEvents({ events: [' a.b.c ', 'a.b.c', '', 'd.e.f'] })).toEqual(['a.b.c', 'd.e.f']);
    expect(femaCommon.normalizeEvents({ events: undefined })).toEqual([]);
  });

  it('matches only configured event types', () => {
    expect(femaCommon.matchesEvents({ type: 'a.b.c', events: ['a.b.c'] })).toBe(true);
    expect(femaCommon.matchesEvents({ type: 'a.b.d', events: ['a.b.c'] })).toBe(false);
  });

  it('derives a fresh subscription code per enable that stays recognisable per webhook address', () => {
    const first = femaCommon.subscriptionCode({ webhookUrl: 'https://ipaas.example.com/api/v1/webhooks/abc' });
    const second = femaCommon.subscriptionCode({ webhookUrl: 'https://ipaas.example.com/api/v1/webhooks/abc' });
    const other = femaCommon.subscriptionCode({ webhookUrl: 'https://ipaas.example.com/api/v1/webhooks/abd' });
    expect(first).toMatch(/^ipaas-[0-9a-f]{24}-[0-9a-f]{16}$/);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(second).not.toBe(first);
    expect(second.slice(0, 30)).toBe(first.slice(0, 30));
    expect(other.slice(0, 30)).not.toBe(first.slice(0, 30));
  });
});

describe('femaCommon.rememberEvent', () => {
  it('lets an event through once inside the window', async () => {
    const store = memoryStore();
    const now = Date.parse('2026-11-05T00:00:00Z');
    expect(await femaCommon.rememberEvent({ store, id: 'e1', now })).toBe(true);
    expect(await femaCommon.rememberEvent({ store, id: 'e1', now: now + 9 * 60 * 60 * 1000 })).toBe(false);
    expect(await femaCommon.rememberEvent({ store, id: 'e2', now })).toBe(true);
  });

  it('forgets an event after a day', async () => {
    const store = memoryStore();
    const now = Date.parse('2026-11-05T00:00:00Z');
    await femaCommon.rememberEvent({ store, id: 'e1', now });
    expect(await femaCommon.rememberEvent({ store, id: 'e1', now: now + 25 * 60 * 60 * 1000 })).toBe(true);
  });
});

describe('femaCommon.unwrap', () => {
  it('returns the data of a SUCCESS envelope', () => {
    expect(femaCommon.unwrap({ body: { code: 'SUCCESS', message: null, data: { id: 1 } }, path: 'x' })).toEqual({ id: 1 });
  });

  it('throws the code and message of a failed envelope', () => {
    expect(() => femaCommon.unwrap({ body: { code: 'PERMISSION_DENIED', message: '没有读合同的权限' }, path: 'webhook/subscription/create' }))
      .toThrow(/PERMISSION_DENIED.*没有读合同的权限/);
  });

  it('passes other bodies through', () => {
    expect(femaCommon.unwrap({ body: [1, 2], path: 'x' })).toEqual([1, 2]);
  });
});
