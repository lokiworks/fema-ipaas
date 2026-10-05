import { beforeEach, describe, expect, it, vi } from 'vitest';

type SentRequest = { url: string; method: string; body?: unknown; queryParams?: Record<string, string> };

const sendRequest = vi.fn<(request: SentRequest) => Promise<unknown>>();

vi.mock('@fema-ipaas/connector-common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fema-ipaas/connector-common')>()),
  httpClient: { sendRequest: (request: SentRequest) => sendRequest(request) },
}));

const { beisenCommon } = await import('../src/lib/common');
const { beisenTimeWindow, TIME_WINDOW_PATH } = await import('../src/lib/common/time-window');
const { beisenChangeWindow, OVERLAP_MS } = await import('../src/lib/common/change-window');
const { getSubOrganizations } = await import('../src/lib/actions/get-sub-organizations');
const { getEmploymentRecords } = await import('../src/lib/actions/get-employment-records');
const { getOnboardingStaff } = await import('../src/lib/actions/get-onboarding-staff');
const { listOrganizationEmployees } = await import('../src/lib/actions/list-organization-employees');
const { findEmployeeByEmail } = await import('../src/lib/actions/find-employee-by-email');
const { employeeChanged } = await import('../src/lib/triggers/employee-changed');

function authFor(appKey: string) {
  return { props: { appKey, appSecret: 'secret' } };
}

function reply(body: unknown) {
  return { status: 200, body, headers: {} };
}

function route(handler: (request: SentRequest) => unknown) {
  sendRequest.mockImplementation(async (request) => {
    if (request.url.endsWith('/token')) {
      return reply({ access_token: 't', expires_in: 7200 });
    }
    return reply(handler(request));
  });
}

function businessCalls(): SentRequest[] {
  return sendRequest.mock.calls.map(([request]) => request).filter((request) => !request.url.endsWith('/token'));
}

function employee(userID: number, extra: Record<string, unknown> = {}) {
  return { originalId: null, employeeInfo: { userID, name: `E${userID}` }, recordInfo: { userID, jobNumber: `E${userID}`, ...extra } };
}

describe('Beisen business envelope', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('treats the string code "200" that the documentation shows as success', () => {
    expect(beisenCommon.isSuccessCode('200')).toBe(true);
    expect(beisenCommon.isSuccessCode(200)).toBe(true);
    expect(beisenCommon.isSuccessCode('417')).toBe(false);
    expect(beisenCommon.isSuccessCode('500')).toBe(false);
    expect(beisenCommon.isSuccessCode('400')).toBe(false);
    expect(beisenCommon.isSuccessCode(undefined)).toBe(false);
    expect(beisenCommon.isSuccessCode('ok')).toBe(false);
  });

  it('reads a time window page whose code is the string "200"', async () => {
    route(() => ({ code: '200', message: '', total: 1, scrollId: 's1', isLastData: false, data: [employee(1)] }));

    const page = await beisenTimeWindow.fetchPage({ auth: authFor('env-1'), body: {} });

    expect(page.records).toHaveLength(1);
    expect(page.scrollId).toBe('s1');
  });

  it('raises the parameter error Beisen answers with code "417" and keeps its message', async () => {
    route(() => ({ data: null, code: '417', message: '只支持查询90天范围内的数据，请分段查询' }));

    await expect(beisenTimeWindow.fetchPage({ auth: authFor('env-2'), body: {} })).rejects.toThrowError(
      '只支持查询90天范围内的数据，请分段查询 (Beisen code 417)',
    );
  });

  it('returns null instead of failing when a lookup finds nobody and Beisen answers code 200 with null data', async () => {
    route(() => ({ data: null, code: '200', message: '' }));

    const result = await beisenCommon.callBusinessApi({ auth: authFor('env-3'), method: 'POST' as never, path: '/x' });

    expect(result).toBeNull();
  });

  it('raises an error carrying the code when a business call fails', async () => {
    route(() => ({ data: null, code: 417, message: 'OId必须大于等于0' }));

    await expect(beisenCommon.callBusinessApi({ auth: authFor('env-4'), method: 'POST' as never, path: '/x' })).rejects.toThrowError(
      'OId必须大于等于0 (Beisen code 417)',
    );
  });

  it('stops following the scroll as soon as Beisen says this is the last batch', async () => {
    route(() => ({ code: '200', scrollId: 'more', isLastData: true, data: [employee(1), employee(2)] }));

    const records = await beisenTimeWindow.drain({ auth: authFor('env-5'), scope: 'ACTIVE', queryType: 2, startMs: 0, stopMs: 1000, timeZone: 'UTC' });

    expect(records).toHaveLength(2);
    expect(businessCalls()).toHaveLength(1);
  });
});

describe('beisenChangeWindow', () => {
  const MINUTE = 60_000;

  it('starts a poll five minutes before the previous one ended so a change that was not visible yet is not lost', () => {
    expect(beisenChangeWindow.startFor({ lastFetchEpochMS: 1_000_000, enabledAtEpochMS: undefined, initialLookbackMs: 1 })).toBe(1_000_000 - OVERLAP_MS);
  });

  it('never reaches back before the moment the trigger was switched on', () => {
    expect(beisenChangeWindow.startFor({ lastFetchEpochMS: 1_000_000, enabledAtEpochMS: 1_000_000 - MINUTE, initialLookbackMs: 1 })).toBe(1_000_000 - MINUTE);
  });

  it('keeps the old one day lookback for the very first test run', () => {
    const before = Date.now();
    const start = beisenChangeWindow.startFor({ lastFetchEpochMS: 0, enabledAtEpochMS: undefined, initialLookbackMs: 3_600_000 });

    expect(start).toBeGreaterThanOrEqual(before - 3_600_000);
    expect(start).toBeLessThanOrEqual(Date.now() - 3_600_000);
  });

  it('passes records it has not seen and drops identical ones from the overlapped part of the window', () => {
    const a = employee(1);
    const b = employee(2);
    const first = beisenChangeWindow.dedupe({ records: [a], seen: {}, stopMs: 10 * MINUTE, startMs: 5 * MINUTE });
    const second = beisenChangeWindow.dedupe({ records: [a, b], seen: first.seen, stopMs: 12 * MINUTE, startMs: 9 * MINUTE });

    expect(first.fresh).toEqual([a]);
    expect(second.fresh).toEqual([b]);
  });

  it('reports a record again once its content changed', () => {
    const before = employee(1, { oIdDepartment: 1 });
    const after = employee(1, { oIdDepartment: 2 });
    const first = beisenChangeWindow.dedupe({ records: [before], seen: {}, stopMs: 10 * MINUTE, startMs: 5 * MINUTE });

    expect(beisenChangeWindow.dedupe({ records: [after], seen: first.seen, stopMs: 11 * MINUTE, startMs: 6 * MINUTE }).fresh).toEqual([after]);
  });

  it('forgets a record once no window can reach it any more', () => {
    const a = employee(1);
    const first = beisenChangeWindow.dedupe({ records: [a], seen: {}, stopMs: 10 * MINUTE, startMs: 5 * MINUTE });
    const later = beisenChangeWindow.dedupe({ records: [], seen: first.seen, stopMs: 40 * MINUTE, startMs: 20 * MINUTE });

    expect(Object.keys(later.seen)).toHaveLength(0);
  });
});

function memoryStore() {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key: string) => (data.has(key) ? data.get(key) : null),
    put: async (key: string, value: unknown) => {
      data.set(key, value);
      return value;
    },
    delete: async (key: string) => {
      data.delete(key);
    },
  };
}

describe('employee changed trigger', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  async function pollWith({ store, records, enabled }: { store: ReturnType<typeof memoryStore>; records: unknown[]; enabled?: boolean }) {
    route(() => ({ code: '200', scrollId: 's', isLastData: true, data: records }));
    const context = {
      auth: authFor('trig-1'),
      store,
      propsValue: { statusScope: 'ACTIVE', queryType: 2, timezone: 'Asia/Shanghai' },
      files: {},
      isRepublish: false,
    };
    if (enabled) {
      await employeeChanged.onEnable(context as never);
      return [];
    }
    return employeeChanged.run(context as never);
  }

  it('emits a change once even though the next window overlaps the previous one', async () => {
    const store = memoryStore();
    await pollWith({ store, records: [], enabled: true });
    store.data.set('lastPoll', Date.now() - 60_000);
    store.data.set('enabledAt', Date.now() - 60_000);
    const a = employee(1, { oIdDepartment: 10 });

    const first = await pollWith({ store, records: [a] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await pollWith({ store, records: [a, employee(2)] });

    expect(first).toEqual([a]);
    expect(second).toEqual([employee(2)]);
  });

  it('asks for a window that starts before the last poll ended but not before the trigger was enabled', async () => {
    const store = memoryStore();
    await pollWith({ store, records: [], enabled: true });
    const enabledAt = Number(store.data.get('enabledAt'));
    store.data.set('lastPoll', enabledAt + 2 * 60_000);

    await pollWith({ store, records: [] });

    const body = businessCalls().at(-1)?.body as { startTime: string };
    const expectedStart = beisenTimeWindow.formatTimestamp({ epochMs: enabledAt, timeZone: 'Asia/Shanghai' });
    expect(body.startTime).toBe(expectedStart);
  });

  it('does not reset the floor and the seen list when a republish keeps the previous state', async () => {
    const store = memoryStore();
    await pollWith({ store, records: [], enabled: true });
    const enabledAt = store.data.get('enabledAt');
    store.data.set('seenRecords', { abc: 1 });

    await employeeChanged.onEnable({ auth: authFor('trig-1'), store, propsValue: {}, isRepublish: true } as never);

    expect(store.data.get('enabledAt')).toBe(enabledAt);
    expect(store.data.get('seenRecords')).toEqual({ abc: 1 });
  });

  it('emits every record on the first test call without touching the seen list', async () => {
    const store = memoryStore();
    route(() => ({ code: '200', scrollId: 's', isLastData: true, data: [employee(1)] }));

    const sample = await employeeChanged.test({
      auth: authFor('trig-1'),
      store,
      propsValue: { statusScope: 'ACTIVE', queryType: 2, timezone: 'UTC' },
      files: {},
    } as never);

    expect(sample).toEqual([employee(1)]);
    expect(store.data.has('seenRecords')).toBe(false);
  });
});

describe('Beisen actions use the documented request shapes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lists direct children with oId, and the whole tree through the tree interface with oIds', async () => {
    route(() => ({ code: '200', data: [{ oId: 5 }] }));

    await getSubOrganizations.run({ auth: authFor('act-1'), propsValue: { organizationId: '900100000', includeAllLevels: false } } as never);
    await getSubOrganizations.run({ auth: authFor('act-1'), propsValue: { organizationId: '900100000', includeAllLevels: true, includeDisabled: true } } as never);

    const [children, tree] = businessCalls();
    expect(children.url).toMatch(/\/Organization\/GetSubOrganizations$/);
    expect(children.body).toEqual({ oId: 900100000, isWithDisable: false, isWithSelf: false });
    expect(tree.url).toMatch(/\/Organization\/GetSubOrganizationTrees$/);
    expect(tree.body).toEqual({ oIds: [900100000], isWithDisable: true, isWithSelf: false });
  });

  it('rejects an organization ID that is not a number before calling Beisen', async () => {
    await expect(getSubOrganizations.run({ auth: authFor('act-1'), propsValue: { organizationId: 'root' } } as never)).rejects.toThrowError(/numeric OId/);
    expect(sendRequest).not.toHaveBeenCalled();
  });

  it('sends employee IDs as oIds, 300 at a time', async () => {
    route((request) => ({ code: '200', data: (request.body as { oIds: number[] }).oIds.map((id) => ({ userID: id })) }));
    const ids = Array.from({ length: 650 }, (_, index) => String(index + 1));

    const result = await getEmploymentRecords.run({ auth: authFor('act-2'), propsValue: { userIds: ids } } as never);

    const calls = businessCalls();
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toMatch(/\/Employee\/GetServiceInfoByIds$/);
    expect((calls[0].body as { oIds: number[] }).oIds).toHaveLength(300);
    expect((calls[2].body as { oIds: number[] }).oIds).toHaveLength(50);
    expect(result).toHaveLength(650);
  });

  it('refuses a user ID that is not a whole number', async () => {
    await expect(getEmploymentRecords.run({ auth: authFor('act-2'), propsValue: { userIds: ['12', 'abc'] } } as never)).rejects.toThrowError(/abc/);
  });

  it('posts the onboarding IDs as a bare array and refuses more than 1000', async () => {
    route(() => ({ code: '200', data: [] }));

    await getOnboardingStaff.run({ auth: authFor('act-3'), propsValue: { userIds: ['g1', 'g2'] } } as never);
    await expect(
      getOnboardingStaff.run({ auth: authFor('act-3'), propsValue: { userIds: Array.from({ length: 1001 }, (_, index) => `g${index}`) } } as never),
    ).rejects.toThrowError(/at most 1000/);

    expect(businessCalls()[0].body).toEqual(['g1', 'g2']);
  });

  it('lists an organization roster by following the scroll to the end, without a request field Beisen does not document', async () => {
    const pages = [
      { code: '200', scrollId: 'a', isLastData: false, data: [employee(1), employee(2)] },
      { code: '200', scrollId: 'b', isLastData: true, data: [employee(3)] },
    ];
    route(() => pages.shift());

    const result = await listOrganizationEmployees.run({
      auth: authFor('act-4'),
      propsValue: { organizationId: '900100000', includeSubOrganizations: true, statusScope: 'ACTIVE', maxItems: 100 },
    } as never);

    expect(result).toMatchObject({ count: 3 });
    const [first, second] = businessCalls();
    expect(first.url).toMatch(/\/Employee\/GetEmployeeOfOrganization$/);
    expect(first.body).toMatchObject({ orgOId: 900100000, includeSubOrg: true, serviceType: [0], empStatus: [2, 3, 7], capacity: 300 });
    expect(first.body).not.toHaveProperty('approvalStatuses');
    expect(first.body).not.toHaveProperty('scrollId');
    expect(second.body).toMatchObject({ scrollId: 'a' });
  });

  it('stops listing at the maximum and asks Beisen for departed employees only when the scope says so', async () => {
    route(() => ({ code: '200', scrollId: 'more', isLastData: false, data: [employee(1), employee(2), employee(3)] }));

    const result = await listOrganizationEmployees.run({
      auth: authFor('act-5'),
      propsValue: { organizationId: '900100000', statusScope: 'ALL', maxItems: 2 },
    } as never);

    expect(result).toMatchObject({ count: 2 });
    expect(businessCalls()).toHaveLength(1);
    expect(businessCalls()[0].body).toMatchObject({ withDisabled: true });
    expect(businessCalls()[0].body).not.toHaveProperty('empStatus');
  });

  it('finds an employee by lowercased email and reports found=false for null', async () => {
    route((request) => ({ code: '200', data: (request.body as { email: string }).email === 'zs@example.com' ? 100234 : null }));

    const hit = await findEmployeeByEmail.run({ auth: authFor('act-6'), propsValue: { email: ' ZS@Example.com ' } } as never);
    const miss = await findEmployeeByEmail.run({ auth: authFor('act-6'), propsValue: { email: 'nobody@example.com' } } as never);

    expect(hit).toEqual({ found: true, user_id: 100234 });
    expect(miss).toEqual({ found: false, user_id: null });
    expect(businessCalls()[0].url).toMatch(/\/Employee\/GetUserIDByEmail$/);
  });
});

describe('time window endpoint', () => {
  it('is the v5 endpoint the documentation recommends', () => {
    expect(TIME_WINDOW_PATH).toBe('/TenantBaseExternal/api/v5/Employee/GetByTimeWindow');
  });
});
