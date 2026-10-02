import { HttpError, HttpMethod } from '@fema-ipaas/connector-common';
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

describe('beisenCommon.filterByColumn', () => {
  const records = [
    { UserID: 'u1', Status: '试用', Name: '甲' },
    { UserID: 'u2', Status: '正式', Name: '乙' },
    { UserID: 'u3', Name: '丙' },
  ];

  it('keeps every record when no column or no value is given', () => {
    expect(beisenCommon.filterByColumn({ records, column: undefined, values: ['试用'] })).toHaveLength(3);
    expect(beisenCommon.filterByColumn({ records, column: 'Status', values: [] })).toHaveLength(3);
    expect(beisenCommon.filterByColumn({ records, column: '  ', values: ['试用'] })).toHaveLength(3);
  });

  it('keeps only the records whose column equals one of the values', () => {
    const kept = beisenCommon.filterByColumn({ records, column: 'Status', values: ['试用', ' 离职 '] });
    expect(kept.map((record) => record['UserID'])).toEqual(['u1']);
  });

  it('drops records that do not have the column at all', () => {
    const kept = beisenCommon.filterByColumn({ records, column: 'Status', values: ['正式'] });
    expect(kept.map((record) => record['UserID'])).toEqual(['u2']);
  });
});

describe('beisenCommon.columnsWith', () => {
  it('adds the filter column to an explicit column list so it comes back', () => {
    expect(beisenCommon.columnsWith({ columns: ['UserID'], column: 'Status' })).toEqual(['UserID', 'Status']);
    expect(beisenCommon.columnsWith({ columns: ['UserID', 'Status'], column: 'Status' })).toEqual(['UserID', 'Status']);
  });

  it('leaves an empty list empty so Beisen decides the columns', () => {
    expect(beisenCommon.columnsWith({ columns: [], column: 'Status' })).toEqual([]);
  });
});

describe('beisenCommon.callApi rate limiting', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sendRequest.mockResolvedValueOnce(
      tokenResponse({ access_token: 'limit-token', expires_in: 3600 }),
    );
  });

  it('turns an HTTP 429 into a clear, non-retryable message', async () => {
    sendRequest.mockRejectedValueOnce(
      new HttpError({}, { status: 429, responseBody: 'API rate limit exceeded' }),
    );

    await expect(
      beisenCommon.callApi({
        auth: authFor('limit-key-1'),
        method: HttpMethod.POST,
        path: '/any',
      }),
    ).rejects.toThrowError(/^HTTP 429: .*00:00 the next day/);
  });

  it('recognises the limit when Beisen reports it inside a 200 body', async () => {
    sendRequest.mockResolvedValueOnce({
      status: 200,
      body: { error: 'limited', error_description: 'API rate limit exceeded' },
      headers: {},
    });

    await expect(
      beisenCommon.callApi({
        auth: authFor('limit-key-2'),
        method: HttpMethod.POST,
        path: '/any',
      }),
    ).rejects.toThrowError(/^HTTP 429: /);
  });

  it('leaves other HTTP errors alone', async () => {
    const failure = new HttpError({}, { status: 403, responseBody: 'IP not allowed' });
    sendRequest.mockRejectedValueOnce(failure);

    await expect(
      beisenCommon.callApi({
        auth: authFor('limit-key-3'),
        method: HttpMethod.POST,
        path: '/any',
      }),
    ).rejects.toBe(failure);
  });
});

describe('beisenCommon.callApi credential problems', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('drops a token Beisen rejected, asks for a new one and repeats the call once', async () => {
    sendRequest
      .mockResolvedValueOnce(tokenResponse({ access_token: 'stale-token', expires_in: 3600 }))
      .mockRejectedValueOnce(new HttpError({}, { status: 401, responseBody: 'invalid token' }))
      .mockResolvedValueOnce(tokenResponse({ access_token: 'fresh-token', expires_in: 3600 }))
      .mockResolvedValueOnce(tokenResponse({ data: [{ UserID: 'u-1' }] }));

    const body = await beisenCommon.callApi({
      auth: authFor('revoked-key'),
      method: HttpMethod.POST,
      path: '/any',
    });

    expect(body).toEqual({ data: [{ UserID: 'u-1' }] });
    const retried = sendRequest.mock.calls.at(-1)?.[0];
    expect(retried.authentication.token).toBe('fresh-token');
  });

  it('reports an HTTP 401 when the repeated call is rejected too', async () => {
    sendRequest
      .mockResolvedValueOnce(tokenResponse({ access_token: 'stale-token', expires_in: 3600 }))
      .mockRejectedValueOnce(new HttpError({}, { status: 401, responseBody: 'invalid token' }))
      .mockResolvedValueOnce(tokenResponse({ access_token: 'fresh-token', expires_in: 3600 }))
      .mockRejectedValueOnce(new HttpError({}, { status: 401, responseBody: 'invalid token' }));

    await expect(
      beisenCommon.callApi({
        auth: authFor('revoked-key-2'),
        method: HttpMethod.POST,
        path: '/any',
      }),
    ).rejects.toThrowError(/^HTTP 401: Beisen rejected the access token\. Check that the connector Key and Secret/);
  });

  it('reports an HTTP 401 without repeating when Beisen refuses to issue a token', async () => {
    sendRequest.mockResolvedValueOnce(
      tokenResponse({ error: 'invalid_client', error_description: 'Invalid app_key', error_code: '10001' }),
    );

    await expect(
      beisenCommon.callApi({
        auth: authFor('wrong-key'),
        method: HttpMethod.POST,
        path: '/any',
      }),
    ).rejects.toThrowError(/^HTTP 401: Invalid app_key \(Beisen error 10001\)/);
    expect(sendRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps the plain message when a connection is saved with wrong credentials', async () => {
    sendRequest.mockResolvedValueOnce(
      tokenResponse({ error: 'invalid_client', error_description: 'Invalid app_key', error_code: '10001' }),
    );

    await expect(
      beisenCommon.obtainAccessToken({ appKey: 'wrong-key-2', appSecret: 's' }),
    ).rejects.toThrowError(/^Invalid app_key \(Beisen error 10001\)$/);
  });
});
