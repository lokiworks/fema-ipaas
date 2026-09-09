import Crypto from 'crypto';

import { describe, expect, it } from 'vitest';

import { eventPayload } from '../src/lib/event-payload';

const ENCRYPT_KEY = 'a-feishu-encrypt-key';

function encryptForFeishu(plain: string): string {
  const key = Crypto.createHash('sha256').update(ENCRYPT_KEY).digest();
  const iv = Crypto.randomBytes(16);
  const cipher = Crypto.createCipheriv('aes-256-cbc', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body]).toString('base64');
}

describe('eventPayload.decode', () => {
  it('passes an unencrypted body straight through', () => {
    expect(eventPayload.decode({ payload: { challenge: 'abc' }, encryptKey: undefined })).toEqual({
      challenge: 'abc',
    });
  });

  it('decrypts the envelope Feishu sends when encryption is switched on', () => {
    const encrypt = encryptForFeishu(JSON.stringify({ header: { token: 'v-token' } }));

    expect(eventPayload.decode({ payload: { encrypt }, encryptKey: ENCRYPT_KEY })).toEqual({
      header: { token: 'v-token' },
    });
  });

  it('says which setting is missing when an encrypted event arrives without a key', () => {
    expect(() => eventPayload.decode({ payload: { encrypt: 'anything' }, encryptKey: undefined }))
      .toThrowError(/Encrypt Key/);
  });

  it('says which setting is missing when the key is an empty string', () => {
    expect(() => eventPayload.decode({ payload: { encrypt: 'anything' }, encryptKey: '' }))
      .toThrowError(/Encrypt Key/);
  });

  it('yields an empty body for anything that is not an object', () => {
    expect(eventPayload.decode({ payload: 'not an object', encryptKey: undefined })).toEqual({});
    expect(eventPayload.decode({ payload: null, encryptKey: undefined })).toEqual({});
    expect(eventPayload.decode({ payload: [1, 2], encryptKey: undefined })).toEqual({});
  });
});

describe('eventPayload.token', () => {
  it('reads the v2 token from the header', () => {
    expect(eventPayload.token({ header: { token: 'from-header' }, token: 'from-body' })).toBe(
      'from-header',
    );
  });

  it('falls back to the v1 token at the top level', () => {
    expect(eventPayload.token({ token: 'from-body' })).toBe('from-body');
  });

  it('returns undefined when neither shape carries a token', () => {
    expect(eventPayload.token({ header: {} })).toBeUndefined();
  });
});

describe('eventPayload.eventType', () => {
  it('reads the v2 event type from the header', () => {
    expect(eventPayload.eventType({ header: { event_type: 'im.message.receive_v1' } })).toBe(
      'im.message.receive_v1',
    );
  });

  it('falls back to the v1 type nested under event', () => {
    expect(eventPayload.eventType({ event: { type: 'message' } })).toBe('message');
  });

  it('returns undefined when neither shape carries a type', () => {
    expect(eventPayload.eventType({ event: {} })).toBeUndefined();
  });
});

describe('eventPayload.challenge', () => {
  it('returns the challenge Feishu expects echoed back', () => {
    expect(eventPayload.challenge({ challenge: 'ajls384kdjx98XX' })).toBe('ajls384kdjx98XX');
  });

  it('returns an empty string when the body carries no challenge', () => {
    expect(eventPayload.challenge({})).toBe('');
  });
});
