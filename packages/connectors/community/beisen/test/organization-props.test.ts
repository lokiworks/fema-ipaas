import { beforeEach, describe, expect, it, vi } from 'vitest';

type SentRequest = { url: string; method: string; body?: unknown };

const sendRequest = vi.fn<(request: SentRequest) => Promise<unknown>>();

vi.mock('@fema-ipaas/connector-common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fema-ipaas/connector-common')>()),
  httpClient: { sendRequest: (request: SentRequest) => sendRequest(request) },
}));

const { beisenOrganizationProps } = await import('../src/lib/common/organization-props');
const { beisenEmployeeDirectory } = await import('../src/lib/common/employee-directory');

const auth = { props: { appKey: 'organization-props-key', appSecret: 'secret' } };

function route(handler: (request: SentRequest) => unknown) {
  sendRequest.mockImplementation(async (request) => {
    if (request.url.endsWith('/token')) {
      return { status: 200, body: { access_token: 't', expires_in: 7200 }, headers: {} };
    }
    return { status: 200, body: handler(request), headers: {} };
  });
}

describe('Beisen root organization dropdown', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lists every organization unit with its OId, roots first', async () => {
    route(() => ({
      code: '200',
      data: [
        { oId: 20301, name: '研发部', pOIdOrgAdmin: 900100000, status: 1 },
        { oId: 900100000, name: '公司', pOIdOrgAdmin: 0, status: 1 },
      ],
    }));
    const state = await beisenOrganizationProps.listOptions({ auth });

    expect(state).toEqual({
      disabled: false,
      options: [
        { label: '公司 (900100000)', value: '900100000' },
        { label: '研发部 (20301)', value: '20301' },
      ],
    });
    const call = sendRequest.mock.calls.map(([request]) => request).find((request) => !request.url.endsWith('/token'));
    expect(call?.url).toMatch(/\/Organization\/GetSubOrganizationTrees$/);
    expect(call?.body).toMatchObject({ oIds: [0] });
  });

  it('asks for a connection before listing', async () => {
    const state = await beisenOrganizationProps.listOptions({ auth: undefined });

    expect(state).toMatchObject({ disabled: true, placeholder: 'Select a Beisen connection first' });
  });

  it('names the root organization field when Beisen says the organization does not exist', async () => {
    route(() => ({ code: '417', message: '组织单元不存在', data: null }));

    await expect(beisenEmployeeDirectory.find({ auth, rootOrganizationId: '123', employeeNo: 'E1' })).rejects.toThrow(/Root organization OId does not exist: 123/);
  });
});
