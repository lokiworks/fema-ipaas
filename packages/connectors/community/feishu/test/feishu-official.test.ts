import { beforeEach, describe, expect, it, vi } from 'vitest';

type SentRequest = {
  url: string;
  method: string;
  body?: Record<string, unknown>;
  queryParams?: Record<string, string>;
  authentication?: { token: string };
};

const sendRequest = vi.fn<(request: SentRequest) => Promise<unknown>>();

vi.mock('@fema-ipaas/connector-common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fema-ipaas/connector-common')>()),
  httpClient: { sendRequest: (request: SentRequest) => sendRequest(request) },
}));

const { feishuContacts } = await import('../src/lib/common/contacts');
const { feishuCommon } = await import('../src/lib/common');
const { feishuIdempotency } = await import('../src/lib/common/idempotency');
const { feishuErrorTable } = await import('../src/lib/common/error-table');
const { sendGroupMessage } = await import('../src/lib/actions/send-group-message');
const { sendDirectMessage } = await import('../src/lib/actions/send-direct-message');
const { createBitableRecord } = await import('../src/lib/actions/create-bitable-record');
const { searchBitableRecords } = await import('../src/lib/actions/search-bitable-records');
const { findUser } = await import('../src/lib/actions/find-user');
const { HttpError, HttpMethod } = await import('@fema-ipaas/connector-common');
const { blockedUntilMarker } = await import('@fema-ipaas/connector-sdk');

function authFor(appId: string) {
  return { type: 'CUSTOM_AUTH' as const, props: { domain: 'https://open.feishu.cn', appId, appSecret: 'secret' } };
}

function reply(body: unknown, headers: Record<string, string> = {}) {
  return { status: 200, body, headers };
}

function tokenReply() {
  return reply({ code: 0, msg: 'ok', tenant_access_token: 't-1', expire: 7200 });
}

function apiCalls(): SentRequest[] {
  return sendRequest.mock.calls.map(([request]) => request).filter((request) => !request.url.endsWith('/tenant_access_token/internal'));
}

function route(handler: (request: SentRequest) => unknown) {
  sendRequest.mockImplementation(async (request) => {
    if (request.url.endsWith('/tenant_access_token/internal')) {
      return tokenReply();
    }
    return handler(request);
  });
}

function failWith({ status, code, msg, headers }: { status: number; code: number; msg: string; headers?: Record<string, string> }): never {
  throw new HttpError({}, { status, responseBody: { code, msg }, responseHeaders: headers ?? {} });
}

const input = { name: '张三', mobile: '13800000000', departmentId: 'od-rd', employeeType: 1, email: 'zs@example.com' };

describe('provisionUser reuses an account that already exists', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('looks the mobile up in both spellings, and the email', async () => {
    route((request) =>
      request.url.endsWith('/batch_get_id') ? reply({ code: 0, data: { user_list: [] } }) : reply({ code: 0, data: { user: { open_id: 'ou_new' } } }),
    );

    await feishuContacts.provisionUser({ auth: authFor('cli_a1'), input });

    const lookup = apiCalls()[0];
    expect(lookup.url).toMatch(/\/contact\/v3\/users\/batch_get_id$/);
    expect(lookup.body).toEqual({ mobiles: ['13800000000', '+8613800000000'], emails: ['zs@example.com'], include_resigned: false });
  });

  it('reports which key matched and whether the account is suspended', async () => {
    route(() =>
      reply({
        code: 0,
        data: {
          user_list: [
            { mobile: '13800000000' },
            { mobile: '+8613800000000', user_id: 'ou_old', status: { is_frozen: true, is_resigned: false } },
            { email: 'zs@example.com' },
          ],
        },
      }),
    );

    const result = await feishuContacts.provisionUser({ auth: authFor('cli_a2'), input });

    expect(result).toEqual({ created: false, open_id: 'ou_old', mobile: '+8613800000000', matched_by: 'mobile', is_frozen: true });
    expect(apiCalls()).toHaveLength(1);
  });

  it('matches by email alone when the mobile is unknown to Feishu', async () => {
    route(() => reply({ code: 0, data: { user_list: [{ mobile: '13800000000' }, { email: 'zs@example.com', user_id: 'ou_mail' }] } }));

    const result = await feishuContacts.provisionUser({ auth: authFor('cli_a3'), input });

    expect(result).toMatchObject({ created: false, open_id: 'ou_mail', matched_by: 'email' });
  });

  it('names the resigned account when the create call is blocked by it, instead of reusing it', async () => {
    route((request) => {
      if (request.url.endsWith('/batch_get_id')) {
        const resignedVisible = (request.body as { include_resigned: boolean }).include_resigned;
        return reply({ code: 0, data: { user_list: resignedVisible ? [{ mobile: '13800000000', user_id: 'ou_gone', status: { is_resigned: true } }] : [] } });
      }
      return failWith({ status: 400, code: 41001, msg: 'mobile has already exist error' });
    });

    await expect(feishuContacts.provisionUser({ auth: authFor('cli_a4'), input })).rejects.toThrowError(/resigned.*Feishu error 42006/);
  });

  it('keeps the create error when the holder cannot be shown to be resigned', async () => {
    route((request) => {
      if (request.url.endsWith('/batch_get_id')) {
        const withResigned = (request.body as { include_resigned: boolean }).include_resigned;
        return reply({ code: 0, data: { user_list: withResigned ? [{ mobile: '13800000000', user_id: 'ou_x' }] : [] } });
      }
      return failWith({ status: 400, code: 41001, msg: 'mobile has already exist error' });
    });

    await expect(feishuContacts.provisionUser({ auth: authFor('cli_a5'), input })).rejects.toThrowError(/Feishu error 41001/);
  });

  it.each([
    [41001, 'mobile has already exist error'],
    [41002, 'email has already exist error'],
    [41053, 'user has already exist error'],
  ])('looks the account up again and returns it when the create call fails with %i', async (code, msg) => {
    let lookups = 0;
    route((request) => {
      if (request.url.endsWith('/batch_get_id')) {
        lookups += 1;
        return reply({ code: 0, data: { user_list: lookups === 1 ? [] : [{ mobile: '+8613800000000', user_id: 'ou_race' }] } });
      }
      return failWith({ status: 400, code, msg });
    });

    const result = await feishuContacts.provisionUser({ auth: authFor(`cli_race_${code}`), input });

    expect(result).toMatchObject({ created: false, open_id: 'ou_race', matched_by: 'mobile' });
    expect(lookups).toBe(2);
  });

  it('keeps the original error when a member outside the contact scope blocks the mobile', async () => {
    route((request) =>
      request.url.endsWith('/batch_get_id')
        ? reply({ code: 0, data: { user_list: [{ mobile: '13800000000' }, { mobile: '+8613800000000' }] } })
        : failWith({ status: 400, code: 41001, msg: 'mobile has already exist error' }),
    );

    await expect(feishuContacts.provisionUser({ auth: authFor('cli_hidden'), input })).rejects.toThrowError(
      /mobile has already exist error — this mobile number already belongs to another Feishu account \(Feishu error 41001\)/,
    );
  });

  it('does not swallow other create failures', async () => {
    route((request) =>
      request.url.endsWith('/batch_get_id') ? reply({ code: 0, data: { user_list: [] } }) : failWith({ status: 403, code: 40004, msg: 'no dept authority error' }),
    );

    await expect(feishuContacts.provisionUser({ auth: authFor('cli_noscope'), input })).rejects.toThrowError(/^HTTP 403: no dept authority error.*contact scope.*Feishu error 40004/);
  });
});

describe('provisionUser idempotency token', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    route((request) =>
      request.url.endsWith('/batch_get_id') ? reply({ code: 0, data: { user_list: [] } }) : reply({ code: 0, data: { user: { open_id: 'ou_new' } } }),
    );
  });

  function tokenOf(): string | undefined {
    return apiCalls().find((request) => request.url.endsWith('/contact/v3/users'))?.queryParams?.['client_token'];
  }

  it('is the same for the same request and a valid UUID', async () => {
    await feishuContacts.provisionUser({ auth: authFor('cli_t1'), input });
    const first = tokenOf();
    sendRequest.mockClear();
    await feishuContacts.provisionUser({ auth: authFor('cli_t1'), input });

    expect(tokenOf()).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it.each([
    ['another department', { departmentId: 'od-hr' }],
    ['another name', { name: '张三丰' }],
    ['another employee number', { employeeNo: 'E2' }],
  ])('changes with %s, so Feishu never answers 40021 for a corrected request', async (_label, change) => {
    await feishuContacts.provisionUser({ auth: authFor('cli_t2'), input });
    const first = tokenOf();
    sendRequest.mockClear();
    await feishuContacts.provisionUser({ auth: authFor('cli_t2'), input: { ...input, ...change } });

    expect(tokenOf()).not.toBe(first);
  });
});

describe('listDepartmentUsers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('follows the page token, asks for 50 per page and drops users listed twice', async () => {
    const pages: Record<string, unknown> = {
      '': { code: 0, data: { items: [{ open_id: 'ou_1', name: 'A', status: { is_frozen: false } }], has_more: true, page_token: 'p2' } },
      p2: { code: 0, data: { items: [{ open_id: 'ou_1', name: 'A' }, { open_id: 'ou_2', name: 'B', status: { is_frozen: true } }], has_more: false } },
    };
    route((request) => reply(pages[request.queryParams?.['page_token'] ?? '']));

    const users = await feishuContacts.listDepartmentUsers({
      auth: authFor('cli_l1'),
      input: { departmentId: 'od-rd', includeSubDepartments: false, maxItems: 100 },
    });

    expect(users.map((user) => user.open_id)).toEqual(['ou_1', 'ou_2']);
    expect(users[1].is_frozen).toBe(true);
    const [first, second] = apiCalls();
    expect(first.queryParams).toMatchObject({ department_id: 'od-rd', department_id_type: 'open_department_id', page_size: '50' });
    expect(second.queryParams).toMatchObject({ page_token: 'p2' });
  });

  it('uses the custom department type for 0 and walks every sub-department when asked', async () => {
    route((request) => {
      if (request.url.includes('/departments/0/children')) {
        return reply({ code: 0, data: { items: [{ open_department_id: 'od-a' }, { open_department_id: 'od-b' }], has_more: false } });
      }
      const departmentId = request.queryParams?.['department_id'];
      return reply({ code: 0, data: { items: [{ open_id: `ou_${departmentId}` }], has_more: false } });
    });

    const users = await feishuContacts.listDepartmentUsers({
      auth: authFor('cli_l2'),
      input: { departmentId: '0', includeSubDepartments: true, maxItems: 100 },
    });

    expect(users.map((user) => user.open_id)).toEqual(['ou_0', 'ou_od-a', 'ou_od-b']);
    const children = apiCalls()[0];
    expect(children.queryParams).toMatchObject({ department_id_type: 'department_id', fetch_child: 'true' });
  });

  it('stops at the requested number of members', async () => {
    route(() => reply({ code: 0, data: { items: [{ open_id: 'ou_1' }, { open_id: 'ou_2' }, { open_id: 'ou_3' }], has_more: true, page_token: 'more' } }));

    const users = await feishuContacts.listDepartmentUsers({
      auth: authFor('cli_l3'),
      input: { departmentId: 'od-rd', includeSubDepartments: false, maxItems: 2 },
    });

    expect(users).toHaveLength(2);
    expect(apiCalls()).toHaveLength(1);
  });
});

describe('feishu error table', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function messageOf(promise: Promise<unknown>): Promise<string> {
    return promise.then(() => '', (error: unknown) => (error instanceof Error ? error.message : String(error)));
  }

  it('turns the free edition monthly quota into a do-not-retry block until the first of next month, Beijing time', async () => {
    route(() => failWith({ status: 429, code: 99991403, msg: "This month's API call quota has been exceeded" }));

    const message = await messageOf(feishuCommon.callApi({ auth: authFor('cli_q1'), method: HttpMethod.GET, path: '/open-apis/x' }));

    expect(message).toMatch(/^HTTP 429: .*used up, an administrator has to upgrade the edition.*\(Feishu error 99991403\)/);
    const until = blockedUntilMarker.parse(message);
    expect(until?.toISOString()).toBe(feishuErrorTable.nextMonthStartInBeijing({ now: new Date() }).toISOString());
    expect((until?.getTime() ?? 0) - Date.now()).toBeGreaterThan(0);
  });

  it('computes the start of next month in Beijing time', () => {
    expect(feishuErrorTable.nextMonthStartInBeijing({ now: new Date('2026-10-31T17:00:00Z') }).toISOString()).toBe('2026-11-30T16:00:00.000Z');
    expect(feishuErrorTable.nextMonthStartInBeijing({ now: new Date('2026-10-05T01:00:00Z') }).toISOString()).toBe('2026-10-31T16:00:00.000Z');
    expect(feishuErrorTable.nextMonthStartInBeijing({ now: new Date('2026-12-20T00:00:00Z') }).toISOString()).toBe('2026-12-31T16:00:00.000Z');
  });

  it('names the IP allowlist when the server address is refused', async () => {
    route(() => failWith({ status: 400, code: 99991401, msg: 'ip 1.2.3.4 is denied by app setting' }));

    const message = await messageOf(feishuCommon.callApi({ auth: authFor('cli_ip'), method: HttpMethod.GET, path: '/open-apis/x' }));

    expect(message).toMatch(/^HTTP 403: .*IP allowlist.*\(Feishu error 99991401\)/);
  });

  it('explains a wrong App Secret from the token endpoint instead of a bare HTTP 400', async () => {
    sendRequest.mockImplementation(async () => failWith({ status: 400, code: 10015, msg: 'wrong app secret' }));

    const message = await messageOf(feishuCommon.obtainTenantAccessToken({ appId: 'cli_bad', appSecret: 'bad' }));

    expect(message).toMatch(/^HTTP 401: wrong app secret.*App Secret is wrong.*\(Feishu error 10015\)/);
  });

  it('treats a bare HTTP 429 from the gateway as a rate limit and honours the reset header', async () => {
    route(() => {
      throw new HttpError({}, { status: 429, responseBody: 'too many requests', responseHeaders: { 'x-ogw-ratelimit-reset': '20' } });
    });
    const before = Date.now();

    const message = await messageOf(feishuCommon.callApi({ auth: authFor('cli_429'), method: HttpMethod.GET, path: '/open-apis/x' }));

    const until = blockedUntilMarker.parse(message)?.getTime() ?? 0;
    expect(message).toMatch(/^HTTP 429: /);
    expect(until - before).toBeGreaterThanOrEqual(19_000);
    expect(until - before).toBeLessThanOrEqual(21_000);
  });

  it.each([
    [11232, 429],
    [11247, 429],
    [230020, 429],
    [1254290, 429],
    [1254291, 429],
  ])('waits instead of failing for the rate limit code %i', async (code, status) => {
    route(() => reply({ code, msg: 'limited' }, { 'x-ogw-ratelimit-reset': '3' }));

    const message = await messageOf(feishuCommon.callApi({ auth: authFor(`cli_rl_${code}`), method: HttpMethod.GET, path: '/open-apis/x' }));

    expect(message).toMatch(new RegExp(`^HTTP ${status}: `));
    expect(blockedUntilMarker.parse(message)).not.toBeNull();
  });

  it.each([
    [40015, /department does not exist/],
    [41017, /department does not exist/],
    [44035, /department does not exist/],
    [41001, /mobile number already belongs/],
    [41002, /email already belongs/],
    [44019, /unverified Feishu organization/],
    [44020, /email is required/],
    [230013, /availability scope/],
    [230006, /bot ability/],
    [1254045, /column name does not exist/],
    [10014, /disabled or not installed/],
  ])('says what is wrong for code %i', (code, expected) => {
    expect(feishuCommon.describeError(code, 'm')).toMatch(expected);
  });

  it('does not describe 230001 as a missing recipient, which the documentation never says', () => {
    expect(feishuCommon.describeError(230001, 'm')).not.toMatch(/does not exist/);
  });
});

describe('message dedupe key', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    route(() => reply({ code: 0, data: { message_id: 'om_1', chat_id: 'oc_1', msg_type: 'text', create_time: '1' } }));
  });

  it('is sent as uuid when given and left out when empty', async () => {
    await sendGroupMessage.run({ auth: authFor('cli_m1'), propsValue: { chatId: 'oc_1', messageType: 'text', content: 'hi', dedupeKey: 'E1001:hire' } } as never);
    await sendDirectMessage.run({ auth: authFor('cli_m1'), propsValue: { receiveIdType: 'email', receiveId: 'a@b.c', messageType: 'text', content: 'hi' } } as never);

    const [group, direct] = apiCalls();
    expect(group.body).toMatchObject({ uuid: 'E1001:hire' });
    expect(direct.body).not.toHaveProperty('uuid');
  });

  it('shortens a key over 50 characters to a stable 50 character value', () => {
    const long = 'k'.repeat(120);
    const first = feishuIdempotency.messageUuidFrom({ key: long });

    expect(first).toHaveLength(50);
    expect(feishuIdempotency.messageUuidFrom({ key: long })).toBe(first);
    expect(feishuIdempotency.messageUuidFrom({ key: `${long}x` })).not.toBe(first);
    expect(feishuIdempotency.messageUuidFrom({ key: '  ' })).toBeUndefined();
  });
});

describe('bitable actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('adds the row once per dedupe key by sending a stable UUID v4 client_token', async () => {
    route(() => reply({ code: 0, data: { record: { record_id: 'rec1', fields: { a: 1 } } } }));
    const props = { appToken: 'bas1', tableId: 'tbl1', fields: { a: 1 }, dedupeKey: 'E1001:hire' };

    await createBitableRecord.run({ auth: authFor('cli_b1'), propsValue: props } as never);
    await createBitableRecord.run({ auth: authFor('cli_b1'), propsValue: { ...props, dedupeKey: 'E1002:hire' } } as never);
    await createBitableRecord.run({ auth: authFor('cli_b1'), propsValue: { ...props, dedupeKey: undefined } } as never);

    const [first, other, none] = apiCalls();
    expect(first.queryParams?.['client_token']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(other.queryParams?.['client_token']).not.toBe(first.queryParams?.['client_token']);
    expect(none.queryParams).toBeUndefined();
  });

  it('writes the listed columns by name and turns a date into milliseconds', async () => {
    route((request) =>
      request.url.endsWith('/fields')
        ? reply({
            code: 0,
            data: {
              items: [
                { field_id: 'fld1', field_name: '姓名', type: 1 },
                { field_id: 'fld2', field_name: '入职日期', type: 5 },
                { field_id: 'fld3', field_name: '标签', type: 4 },
                { field_id: 'fld4', field_name: '创建时间', type: 1001 },
              ],
              has_more: false,
            },
          })
        : reply({ code: 0, data: { record: { record_id: 'rec2', fields: {} } } }),
    );

    await createBitableRecord.run({
      auth: authFor('cli_b3'),
      propsValue: { appToken: 'bas1', tableId: 'tbl1', columns: { fld1: '李雷', fld2: '2026-10-08', fld3: '老员工, 研发', fld4: 'x' }, fields: { '': '' } },
    } as never);

    const write = apiCalls().find((request) => request.url.endsWith('/records'));
    expect(write?.body).toEqual({ fields: { 姓名: '李雷', 入职日期: Date.UTC(2026, 9, 7, 16), 标签: ['老员工', '研发'] } });
  });

  it('refuses to write a row when only blank column names were given', async () => {
    route(() => reply({ code: 0, data: { record: { record_id: 'rec3', fields: {} } } }));

    await expect(
      createBitableRecord.run({ auth: authFor('cli_b4'), propsValue: { appToken: 'bas1', tableId: 'tbl1', columns: {}, fields: { '': '' } } } as never),
    ).rejects.toThrow(/at least one column/);
    expect(apiCalls()).toEqual([]);
  });

  it('lists the writable columns of the table as inputs keyed by field id', async () => {
    const { bitableColumns } = await import('../src/lib/bitable-columns');
    const props = bitableColumns.propsFor({
      columns: [
        { field_id: 'fld1', field_name: '姓名', type: 1 },
        { field_id: 'fld2', field_name: '入职日期', type: 5 },
        { field_id: 'fld9', field_name: '公式', type: 20 },
      ],
    });

    expect(Object.keys(props)).toEqual(['fld1', 'fld2']);
    expect(props['fld2'].displayName).toBe('入职日期');
    expect(bitableColumns.toMilliseconds('2026-10-08 09:30')).toBe(Date.UTC(2026, 9, 8, 1, 30));
    expect(bitableColumns.toMilliseconds(1730000000)).toBe(1730000000000);
  });

  it('pages through the search results up to the requested maximum', async () => {
    const pages: Record<string, unknown> = {
      '': { code: 0, data: { items: [{ record_id: 'r1', fields: { 工号: 'E1' } }, { record_id: 'r2', fields: { 工号: 'E2' } }], has_more: true, page_token: 'n1' } },
      n1: { code: 0, data: { items: [{ record_id: 'r3', fields: { 工号: 'E3' } }], has_more: false } },
    };
    route((request) => reply(pages[request.queryParams?.['page_token'] ?? '']));

    const rows = await searchBitableRecords.run({
      auth: authFor('cli_b2'),
      propsValue: { appToken: 'bas1', tableId: 'tbl1', pageSize: 10, filterField: '工号', filterValue: 'E' },
    } as never);

    expect(rows).toEqual([
      { record_id: 'r1', 工号: 'E1' },
      { record_id: 'r2', 工号: 'E2' },
      { record_id: 'r3', 工号: 'E3' },
    ]);
    const [first, second] = apiCalls();
    expect(first.queryParams).toMatchObject({ page_size: '10' });
    expect(first.body).toMatchObject({ filter: { conjunction: 'and' } });
    expect(second.queryParams).toMatchObject({ page_token: 'n1', page_size: '8' });
  });
});

describe('findUser action', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('asks for resigned members only when told to and reports the account state', async () => {
    route(() => reply({ code: 0, data: { user_list: [{ email: 'a@b.c', user_id: 'ou_9', status: { is_frozen: true, is_resigned: false } }] } }));

    const result = await findUser.run({ auth: authFor('cli_f1'), propsValue: { lookupBy: 'email', value: 'a@b.c', includeResigned: true } } as never);

    expect(apiCalls()[0].body).toEqual({ emails: ['a@b.c'], include_resigned: true });
    expect(result).toEqual({ found: true, open_id: 'ou_9', email: 'a@b.c', mobile: null, is_frozen: true, is_resigned: false });
  });

  it('answers found=false when nobody matches, with the mobile in both spellings', async () => {
    route(() => reply({ code: 0, data: { user_list: [{ mobile: '13800000000' }, { mobile: '+8613800000000' }] } }));

    const result = await findUser.run({ auth: authFor('cli_f2'), propsValue: { lookupBy: 'mobile', value: '138 0000 0000' } } as never);

    expect(apiCalls()[0].body).toEqual({ mobiles: ['13800000000', '+8613800000000'], include_resigned: false });
    expect(result).toMatchObject({ found: false, open_id: null, is_frozen: null, is_resigned: null });
  });
});

describe('output schemas describe what the actions return', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function keysOf(schema: { fields: { key: string }[] } | undefined): string[] {
    return (schema?.fields ?? []).map((field) => field.key);
  }

  it('lists every field provision_user returns, for a created and for a reused account', async () => {
    const { provisionUser } = await import('../src/lib/actions/provision-user');
    route((request) =>
      request.url.endsWith('/batch_get_id') ? reply({ code: 0, data: { user_list: [] } }) : reply({ code: 0, data: { user: { open_id: 'ou_new', user_id: 'u1', union_id: 'on_1' } } }),
    );
    const created = await feishuContacts.provisionUser({ auth: authFor('cli_s1'), input });
    route(() => reply({ code: 0, data: { user_list: [{ mobile: '+8613800000000', user_id: 'ou_old', status: { is_frozen: false } }] } }));
    const reused = await feishuContacts.provisionUser({ auth: authFor('cli_s1'), input });

    const described = keysOf(provisionUser.outputSchema);
    expect(Object.keys(created).filter((key) => !described.includes(key))).toEqual([]);
    expect(Object.keys(reused).filter((key) => !described.includes(key))).toEqual([]);
  });

  it('lists every field get_user and suspend_user return', async () => {
    const { getUser } = await import('../src/lib/actions/get-user');
    const { suspendUser } = await import('../src/lib/actions/suspend-user');
    route(() => reply({ code: 0, data: { user: { open_id: 'ou_1', status: { is_frozen: true } } } }));
    const user = await feishuContacts.getUser({ auth: authFor('cli_s2'), input: { openId: 'ou_1' } });
    const suspended = await feishuContacts.setUserSuspended({ auth: authFor('cli_s2'), input: { openId: 'ou_1', suspended: true } });

    expect(Object.keys(user).filter((key) => !keysOf(getUser.outputSchema).includes(key))).toEqual([]);
    expect(Object.keys(suspended).filter((key) => !keysOf(suspendUser.outputSchema).includes(key))).toEqual([]);
  });
});
