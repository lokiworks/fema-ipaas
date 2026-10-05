import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendRequest = vi.fn();

vi.mock('@fema-ipaas/connector-common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fema-ipaas/connector-common')>()),
  httpClient: { sendRequest: (...args: unknown[]) => sendRequest(...args) },
}));

const { feishuContacts } = await import('../src/lib/common/contacts');

const auth = {
  type: 'CUSTOM_AUTH' as const,
  props: { domain: 'https://open.feishu.cn', appId: 'cli_timeout', appSecret: 'secret' },
};

function abortError(): Error {
  const error = new Error('This operation was aborted');
  error.name = 'AbortError';
  return error;
}

describe('Feishu requests never wait forever', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('gives every call a timeout so a silent Feishu cannot hold a run for the whole run limit', async () => {
    sendRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url.endsWith('/tenant_access_token/internal')) {
        return { status: 200, body: { code: 0, msg: 'ok', tenant_access_token: 't-2', expire: 7200 }, headers: {} };
      }
      return { status: 200, body: { code: 0, msg: 'ok', data: { user: { open_id: 'ou_1', department_ids: [] } } }, headers: {} };
    });

    await feishuContacts.getUser({ auth, input: { openId: 'ou_1' } });

    expect(sendRequest.mock.calls.every(([request]) => typeof request.timeout === 'number' && request.timeout > 0)).toBe(true);
  });

  it('says a write that timed out may have been applied, so the retry reads the account back first', async () => {
    sendRequest.mockImplementation(async ({ url, method }: { url: string; method: string }) => {
      if (url.endsWith('/tenant_access_token/internal')) {
        return { status: 200, body: { code: 0, msg: 'ok', tenant_access_token: 't-3', expire: 7200 }, headers: {} };
      }
      if (method === 'PATCH') {
        throw abortError();
      }
      throw new Error(`unexpected ${method} ${url}`);
    });

    await expect(feishuContacts.updateUser({ auth, input: { openId: 'ou_1', departmentId: 'od-a' } })).rejects.toThrow(/may or may not have been applied/);
  });

  it('describes a read that timed out without claiming anything was written', async () => {
    sendRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url.endsWith('/tenant_access_token/internal')) {
        return { status: 200, body: { code: 0, msg: 'ok', tenant_access_token: 't-4', expire: 7200 }, headers: {} };
      }
      throw abortError();
    });

    await expect(feishuContacts.getUser({ auth, input: { openId: 'ou_1' } })).rejects.toThrow(/did not answer .* within 30 seconds$/);
  });
});
