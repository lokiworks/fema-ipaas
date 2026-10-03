import { beforeEach, describe, expect, it, vi } from 'vitest';

type SentRequest = { url: string; body: Record<string, unknown> };

const sendRequest = vi.fn<(request: SentRequest) => Promise<unknown>>();

vi.mock('@fema-ipaas/connector-common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fema-ipaas/connector-common')>()),
  httpClient: { sendRequest: (request: SentRequest) => sendRequest(request) },
}));

const { beisenTimeWindow, TIME_WINDOW_PATH } = await import('../src/lib/common/time-window');

const DAY_MS = 24 * 60 * 60 * 1000;

function authFor(appKey: string) {
  return { props: { appKey, appSecret: 'secret' } };
}

function token(body: unknown = { access_token: 't', expires_in: 3600 }) {
  return { status: 200, body, headers: {} };
}

function page(body: unknown) {
  return { status: 200, body, headers: {} };
}

function employee(userID: number) {
  return { originalId: null, employeeInfo: { userID }, recordInfo: { userID, jobNumber: `E${userID}` } };
}

describe('beisenTimeWindow.segments', () => {
  it('keeps a short window as one segment', () => {
    expect(beisenTimeWindow.segments({ startMs: 0, stopMs: 5 * DAY_MS })).toEqual([{ startMs: 0, stopMs: 5 * DAY_MS }]);
  });

  it('splits a long window into segments under 90 days that join end to start', () => {
    const result = beisenTimeWindow.segments({ startMs: 0, stopMs: 200 * DAY_MS });
    expect(result).toHaveLength(3);
    expect(result[0].startMs).toBe(0);
    expect(result[2].stopMs).toBe(200 * DAY_MS);
    result.forEach((segment, index) => {
      expect(segment.stopMs - segment.startMs).toBeLessThan(90 * DAY_MS);
      if (index > 0) {
        expect(segment.startMs).toBe(result[index - 1].stopMs);
      }
    });
  });
});

describe('beisenTimeWindow.formatTimestamp', () => {
  it('uses the T separator Beisen documents, in the requested timezone', () => {
    const noonUtc = Date.UTC(2026, 9, 3, 4, 5, 6);
    expect(beisenTimeWindow.formatTimestamp({ epochMs: noonUtc, timeZone: 'UTC' })).toBe('2026-10-03T04:05:06');
    expect(beisenTimeWindow.formatTimestamp({ epochMs: noonUtc, timeZone: 'Asia/Shanghai' })).toBe('2026-10-03T12:05:06');
  });
});

describe('beisenTimeWindow.requestBody', () => {
  const base = { startTime: '2026-10-01T00:00:00', stopTime: '2026-10-02T00:00:00', queryType: 2, capacity: 300 };

  it('limits active employees to trial and regular, effective main records', () => {
    expect(beisenTimeWindow.requestBody({ ...base, scope: 'ACTIVE' })).toMatchObject({
      timeWindowQueryType: 2,
      serviceType: [0],
      empStatus: [2, 3],
      approvalStatuses: [4],
      isGetLatestRecord: false,
      capacity: 300,
    });
  });

  it('asks only for effective leavings so a future leaving is not reported early', () => {
    expect(beisenTimeWindow.requestBody({ ...base, scope: 'LEFT' })).toMatchObject({ empStatus: [8], approvalStatuses: [4], isGetLatestRecord: false });
  });

  it('reads the latest main record for pending onboarding, which may not be effective yet', () => {
    expect(beisenTimeWindow.requestBody({ ...base, scope: 'ONBOARDING' })).toMatchObject({ empStatus: [1, 2, 3], isGetLatestRecord: true });
  });

  it('includes departed employees for every status without listing statuses', () => {
    const body = beisenTimeWindow.requestBody({ ...base, scope: 'ALL' });
    expect(body).toMatchObject({ withDisabled: true });
    expect(body).not.toHaveProperty('empStatus');
  });

  it('adds the scroll id and columns only when given', () => {
    expect(beisenTimeWindow.requestBody({ ...base, scope: 'ACTIVE' })).not.toHaveProperty('scrollId');
    expect(beisenTimeWindow.requestBody({ ...base, scope: 'ACTIVE', scrollId: 's1', columns: ['userID'] })).toMatchObject({ scrollId: 's1', columns: ['userID'] });
  });
});

describe('beisenTimeWindow.drain', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sendRequest.mockResolvedValueOnce(token());
  });

  it('calls the v5 endpoint and follows the scroll id until the data runs out', async () => {
    sendRequest
      .mockResolvedValueOnce(page({ code: 200, scrollId: 'a', data: [employee(1), employee(2)] }))
      .mockResolvedValueOnce(page({ code: 200, scrollId: 'b', data: [employee(3)] }))
      .mockResolvedValueOnce(page({ code: 200, scrollId: 'b', data: [] }));

    const records = await beisenTimeWindow.drain({ auth: authFor('drain-1'), scope: 'ACTIVE', queryType: 2, startMs: 0, stopMs: DAY_MS, timeZone: 'UTC' });

    expect(records).toHaveLength(3);
    const requests = sendRequest.mock.calls.map((call) => call[0]).filter((call) => call.url.endsWith(TIME_WINDOW_PATH));
    expect(requests).toHaveLength(3);
    expect(requests[0].body).not.toHaveProperty('scrollId');
    expect(requests[1].body).toMatchObject({ scrollId: 'a' });
    expect(requests[2].body).toMatchObject({ scrollId: 'b' });
  });

  it('queries every 89-day segment of a long window', async () => {
    sendRequest.mockResolvedValue(page({ code: 200, data: [] }));

    await beisenTimeWindow.drain({ auth: authFor('drain-2'), scope: 'ACTIVE', queryType: 2, startMs: 0, stopMs: 200 * DAY_MS, timeZone: 'UTC' });

    const requests = sendRequest.mock.calls.map((call) => call[0]).filter((call) => call.url.endsWith(TIME_WINDOW_PATH));
    expect(requests).toHaveLength(3);
  });

  it('surfaces the message and code when Beisen rejects the window', async () => {
    sendRequest.mockResolvedValueOnce(page({ code: 417, message: '只支持查询90天范围内的数据，请分段查询' }));

    await expect(
      beisenTimeWindow.drain({ auth: authFor('drain-3'), scope: 'ACTIVE', queryType: 2, startMs: 0, stopMs: DAY_MS, timeZone: 'UTC' }),
    ).rejects.toThrowError('只支持查询90天范围内的数据，请分段查询 (Beisen code 417)');
  });

  it('fails loudly instead of dropping changes when a window never runs dry', async () => {
    sendRequest.mockResolvedValue(page({ code: 200, scrollId: 'again', data: [employee(1)] }));

    await expect(
      beisenTimeWindow.drain({ auth: authFor('drain-4'), scope: 'ACTIVE', queryType: 2, startMs: 0, stopMs: DAY_MS, timeZone: 'UTC' }),
    ).rejects.toThrowError(/more than 30000 changed employees/);
  });
});
