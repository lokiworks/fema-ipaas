import { HttpMethod } from '@fema-ipaas/connector-common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendRequest = vi.fn();

vi.mock('@fema-ipaas/connector-common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fema-ipaas/connector-common')>()),
  httpClient: { sendRequest: (...args: unknown[]) => sendRequest(...args) },
}));

const { beisenCommon } = await import('../src/lib/common');

function authFor(appKey: string) {
  return { props: { appKey, appSecret: 'secret-1' } };
}

function tokenResponse(body: unknown) {
  return { status: 200, body, headers: {} };
}

describe('beisenCommon.obtainAccessToken', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('surfaces the error Beisen hides inside a 200 response', async () => {
    sendRequest.mockResolvedValueOnce(
      tokenResponse({
        error: 'invalid_client',
        error_description: 'app_key or app_secret is wrong',
        error_code: '40001',
      }),
    );

    await expect(
      beisenCommon.obtainAccessToken({ appKey: 'wrong', appSecret: 'wrong' }),
    ).rejects.toThrowError('app_key or app_secret is wrong (Beisen error 40001)');
  });

  it('says what to check when the response carries neither a token nor an error', async () => {
    sendRequest.mockResolvedValueOnce(tokenResponse({}));

    await expect(
      beisenCommon.obtainAccessToken({ appKey: 'blank', appSecret: 'blank' }),
    ).rejects.toThrowError(/Key and Secret/);
  });

  it('reuses a cached token instead of asking for a new one every call', async () => {
    sendRequest.mockResolvedValueOnce(
      tokenResponse({ access_token: 'token-abc', expires_in: 3600 }),
    );

    const first = await beisenCommon.obtainAccessToken({ appKey: 'cache', appSecret: 'me' });
    const second = await beisenCommon.obtainAccessToken({ appKey: 'cache', appSecret: 'me' });

    expect(first).toBe('token-abc');
    expect(second).toBe('token-abc');
    expect(sendRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps a separate token per credential pair', async () => {
    sendRequest
      .mockResolvedValueOnce(tokenResponse({ access_token: 'token-tenant-a', expires_in: 3600 }))
      .mockResolvedValueOnce(tokenResponse({ access_token: 'token-tenant-b', expires_in: 3600 }));

    const a = await beisenCommon.obtainAccessToken({ appKey: 'tenant-a', appSecret: 's' });
    const b = await beisenCommon.obtainAccessToken({ appKey: 'tenant-b', appSecret: 's' });

    expect([a, b]).toEqual(['token-tenant-a', 'token-tenant-b']);
    expect(sendRequest).toHaveBeenCalledTimes(2);
  });

  it('asks again once a short-lived token has aged past its safety margin', async () => {
    vi.useFakeTimers();
    sendRequest
      .mockResolvedValueOnce(tokenResponse({ access_token: 'first', expires_in: 60 }))
      .mockResolvedValueOnce(tokenResponse({ access_token: 'second', expires_in: 60 }));

    const first = await beisenCommon.obtainAccessToken({ appKey: 'short', appSecret: 's' });
    vi.advanceTimersByTime(61_000);
    const second = await beisenCommon.obtainAccessToken({ appKey: 'short', appSecret: 's' });

    expect([first, second]).toEqual(['first', 'second']);
    vi.useRealTimers();
  });
});

describe('beisenCommon.callBusinessApi', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('unwraps the data envelope', async () => {
    const appKey = 'unwrap';
    sendRequest
      .mockResolvedValueOnce(tokenResponse({ access_token: 'token-unwrap', expires_in: 3600 }))
      .mockResolvedValueOnce(tokenResponse({ code: 0, data: [{ UserID: 'u-1' }] }));

    await expect(
      beisenCommon.callBusinessApi({ auth: authFor(appKey), method: HttpMethod.POST, path: '/anything' }),
    ).resolves.toEqual([{ UserID: 'u-1' }]);
  });

  it('reports the business message and code when no data comes back', async () => {
    const appKey = 'no-data';
    sendRequest
      .mockResolvedValueOnce(tokenResponse({ access_token: 'token-nodata', expires_in: 3600 }))
      .mockResolvedValueOnce(tokenResponse({ code: 500, message: 'employee not found' }));

    await expect(
      beisenCommon.callBusinessApi({ auth: authFor(appKey), method: HttpMethod.POST, path: '/anything' }),
    ).rejects.toThrowError('employee not found (Beisen code 500)');
  });

  it('still reports something when the envelope carries no message at all', async () => {
    const appKey = 'empty-envelope';
    sendRequest
      .mockResolvedValueOnce(tokenResponse({ access_token: 'token-empty', expires_in: 3600 }))
      .mockResolvedValueOnce(tokenResponse({}));

    await expect(
      beisenCommon.callBusinessApi({ auth: authFor(appKey), method: HttpMethod.POST, path: '/anything' }),
    ).rejects.toThrowError(/no data/);
  });
});
