import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendRequest = vi.fn();

vi.mock('@fema-ipaas/connector-common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fema-ipaas/connector-common')>()),
  httpClient: { sendRequest: (...args: unknown[]) => sendRequest(...args) },
}));

const { feishuContacts } = await import('../src/lib/common/contacts');
const { HttpError } = await import('@fema-ipaas/connector-common');

const auth = {
  type: 'CUSTOM_AUTH' as const,
  props: { domain: 'https://open.feishu.cn', appId: 'cli_test', appSecret: 'secret' },
};

const input = {
  name: '张三',
  mobile: '138 0000 0000',
  departmentId: 'od-abc',
  employeeType: 1,
  employeeNo: 'E001',
};

function reply(body: unknown) {
  return { status: 200, body, headers: {} };
}

function routeRequests({ existingOpenId }: { existingOpenId: string | null }) {
  sendRequest.mockImplementation(async ({ url }: { url: string }) => {
    if (url.endsWith('/tenant_access_token/internal')) {
      return reply({ code: 0, msg: 'ok', tenant_access_token: 't-1', expire: 7200 });
    }
    if (url.endsWith('/contact/v3/users/batch_get_id')) {
      return reply({ code: 0, msg: 'ok', data: { user_list: [{ mobile: '+8613800000000', ...(existingOpenId ? { user_id: existingOpenId } : {}) }] } });
    }
    if (url.endsWith('/contact/v3/users')) {
      return reply({ code: 0, msg: 'ok', data: { user: { open_id: 'ou_new', user_id: 'u1', union_id: 'on_1' } } });
    }
    throw new Error(`unexpected request ${url}`);
  });
}

function createCalls() {
  return sendRequest.mock.calls.map(([request]) => request).filter((request) => request.url.endsWith('/contact/v3/users'));
}

describe('feishuContacts.provisionUser', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the existing account and creates nothing when the mobile is already in use', async () => {
    routeRequests({ existingOpenId: 'ou_existing' });

    const result = await feishuContacts.provisionUser({ auth, input });

    expect(result).toEqual({ created: false, open_id: 'ou_existing', mobile: '+8613800000000' });
    expect(createCalls()).toHaveLength(0);
  });

  it('creates the account in the department with a stable idempotency token', async () => {
    routeRequests({ existingOpenId: null });

    const first = await feishuContacts.provisionUser({ auth, input });
    const second = await feishuContacts.provisionUser({ auth, input });

    expect(first).toEqual({ created: true, open_id: 'ou_new', mobile: '+8613800000000', user_id: 'u1', union_id: 'on_1' });
    const [firstCreate, secondCreate] = createCalls();
    expect(firstCreate.queryParams).toMatchObject({ user_id_type: 'open_id', department_id_type: 'open_department_id' });
    expect(firstCreate.queryParams.client_token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(secondCreate.queryParams.client_token).toBe(firstCreate.queryParams.client_token);
    expect(firstCreate.body).toEqual({
      name: '张三',
      mobile: '+8613800000000',
      department_ids: ['od-abc'],
      employee_type: 1,
      employee_no: 'E001',
    });
    expect(second.created).toBe(true);
  });

  it('treats a department ID without the od- prefix as the admin console department ID', async () => {
    routeRequests({ existingOpenId: null });

    await feishuContacts.provisionUser({ auth, input: { ...input, departmentId: 'D100' } });

    expect(createCalls()[0].queryParams.department_id_type).toBe('department_id');
  });

  it('surfaces a missing permission with the Feishu error code', async () => {
    sendRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url.endsWith('/tenant_access_token/internal')) {
        return reply({ code: 0, msg: 'ok', tenant_access_token: 't-1', expire: 7200 });
      }
      return reply({ code: 99991672, msg: 'Access denied. One of the following scopes is required: [contact:user.id:readonly]' });
    });

    await expect(feishuContacts.provisionUser({ auth, input })).rejects.toThrowError(/contact:user\.id:readonly.*Feishu error 99991672/);
  });
});

function memberCalls(method: string) {
  return sendRequest.mock.calls.map(([request]) => request).filter((request) => request.method === method && request.url.includes('/contact/v3/users/ou_1'));
}

function routeMemberRequests() {
  sendRequest.mockImplementation(async ({ url }: { url: string }) => {
    if (url.endsWith('/tenant_access_token/internal')) {
      return reply({ code: 0, msg: 'ok', tenant_access_token: 't-1', expire: 7200 });
    }
    return reply({ code: 0, msg: 'ok', data: {} });
  });
}

describe('feishuContacts.updateUser', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sends only the fields that were filled in', async () => {
    routeMemberRequests();

    const result = await feishuContacts.updateUser({ auth, input: { openId: 'ou_1', departmentId: 'od-rd', leaderOpenId: 'ou_boss' } });

    const [call] = memberCalls('PATCH');
    expect(call.queryParams).toMatchObject({ user_id_type: 'open_id', department_id_type: 'open_department_id' });
    expect(call.body).toEqual({ department_ids: ['od-rd'], leader_user_id: 'ou_boss' });
    expect(result).toEqual({ updated: true, open_id: 'ou_1', changed: ['department_ids', 'leader_user_id'] });
  });

  it('does not call Feishu when nothing was filled in', async () => {
    routeMemberRequests();

    const result = await feishuContacts.updateUser({ auth, input: { openId: 'ou_1' } });

    expect(memberCalls('PATCH')).toHaveLength(0);
    expect(result).toEqual({ updated: false, open_id: 'ou_1', changed: [] });
  });
});

describe('feishuContacts.setUserSuspended', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('suspends the account through is_frozen without deleting anything', async () => {
    routeMemberRequests();

    const result = await feishuContacts.setUserSuspended({ auth, input: { openId: 'ou_1', suspended: true } });

    const [call] = memberCalls('PATCH');
    expect(call.queryParams).toEqual({ user_id_type: 'open_id' });
    expect(call.body).toEqual({ status: { is_frozen: true } });
    expect(memberCalls('DELETE')).toHaveLength(0);
    expect(result).toEqual({ open_id: 'ou_1', suspended: true });
  });

  it('resumes the account by clearing is_frozen', async () => {
    routeMemberRequests();

    await feishuContacts.setUserSuspended({ auth, input: { openId: 'ou_1', suspended: false } });

    expect(memberCalls('PATCH')[0].body).toEqual({ status: { is_frozen: false } });
  });
});

describe('feishu HTTP errors', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reads the Feishu code out of an HTTP 400 and reports a missing permission as 403', async () => {
    sendRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url.endsWith('/tenant_access_token/internal')) {
        return reply({ code: 0, msg: 'ok', tenant_access_token: 't-1', expire: 7200 });
      }
      throw new HttpError({}, {
        status: 400,
        responseBody: { code: 99991672, msg: 'Access denied. One of the following scopes is required: [contact:contact]' },
      });
    });

    await expect(feishuContacts.provisionUser({ auth, input })).rejects.toThrowError(
      /^HTTP 403: Access denied.*\[contact:contact\].*Feishu error 99991672/,
    );
  });
});

describe('feishuContacts.normalizeMobile', () => {
  it.each([
    ['13800000000', '+8613800000000'],
    ['138-0000-0000', '+8613800000000'],
    ['+8613800000000', '+8613800000000'],
    ['+85260000000', '+85260000000'],
  ])('normalizes %s to %s', (mobile, expected) => {
    expect(feishuContacts.normalizeMobile(mobile)).toBe(expected);
  });
});
