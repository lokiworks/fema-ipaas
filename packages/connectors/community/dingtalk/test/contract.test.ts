import { describe, expect, it } from 'vitest';
import { connectorContract } from '@fema-ipaas/connector-sdk';
import { dingtalk } from '../src';
import { dingtalkErrorTable } from '../src/lib/common/error-table';

describe('DingTalk reliability contract', () => {
  it('declares safe writes, pagination and error owners', () => {
    expect(connectorContract.violationsOf({ connector: dingtalk })).toEqual([]);
    expect(dingtalkErrorTable.rules().filter((rule) => rule.kind === 'FAILED' && !rule.owner)).toEqual([]);
  });
  it('moves a departing employee without a delete API or a false suspension result', async () => {
    const { dingtalkCommon } = await import('../src/lib/common');
    const spy = vi.spyOn(dingtalkCommon, 'callApi').mockImplementation(async (params) => params.path.endsWith('/get') ? { userid: 'employee', dept_id_list: [99] } : {});
    const { createMockActionContext } = await import('@fema-ipaas/connector-sdk');
    const action = dingtalk.actions()['suspend_user'];
    const result = await action.run({ ...createMockActionContext({ propsValue: { userid: 'employee', pendingDepartmentId: '99' } }), auth: { props: { appKey: 'key', appSecret: 'secret' } } });
    expect(result).toEqual({ userid: 'employee', moved: true, suspended: false, pendingAdminAction: 'RESIGN' });
    expect(spy.mock.calls.map(([params]) => params.path)).toEqual(['/topapi/v2/user/update', '/topapi/v2/user/get']);
    spy.mockRestore();
  });
});

it('keeps members whose other department is outside the scanned subtree', async () => {
  const { dingtalkCommon } = await import('../src/lib/common');
  const { dingtalkDepartments } = await import('../src/lib/common/departments');
  const { dingtalkContacts } = await import('../src/lib/common/contacts');
  const departments = vi.spyOn(dingtalkDepartments, 'list').mockResolvedValue([{ id: '20' }, { id: '30' }]);
  const calls = vi.spyOn(dingtalkCommon, 'callApi').mockResolvedValue({ list: [{ userid: 'employee', dept_id_list: [1, 20, 30] }], has_more: false });
  try {
    const first = await dingtalkContacts.enumerate({ auth: { appKey: 'key', appSecret: 'secret' }, rootDepartmentId: '20', pageSize: 50 });
    expect(first.items.map((row) => row['userid'])).toEqual(['employee']);
    const next = await dingtalkContacts.enumerate({ auth: { appKey: 'key', appSecret: 'secret' }, rootDepartmentId: '20', pageSize: 50, pageToken: first.nextPageToken ?? undefined });
    expect(next.items).toEqual([]);
    expect(next.nextPageToken).toBeNull();
  } finally {
    departments.mockRestore();
    calls.mockRestore();
  }
});
