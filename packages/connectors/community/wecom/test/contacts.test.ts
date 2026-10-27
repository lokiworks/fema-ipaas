import { ConnectionType } from '@fema-ipaas/connector-sdk';
import { httpClient } from '@fema-ipaas/connector-common';
import { isObject } from '@fema-ipaas/connector-sdk';
import { wecomContacts } from '../src/lib/common/contacts';

let createCount = 0;
let user: Record<string, unknown> | null;
let permissionDenied = false;
let tokenKinds: string[] = [];
const auth = { corpId: 'test-corp', contactSecret: 'contact-secret', appSecret: 'application-secret' };

beforeEach(() => {
  createCount = 0; user = null; permissionDenied = false; tokenKinds = [];
  vi.spyOn(httpClient, 'sendRequest').mockImplementation(async (request) => {
    const path = new URL(request.url).pathname;
    const success = { status: 200, headers: {} };
    if (path.endsWith('/gettoken')) { const secret = request.queryParams?.['corpsecret']; tokenKinds.push(String(secret)); return { ...success, body: { errcode: 0, access_token: `token-${secret}`, expires_in: 7200 } }; }
    if (path.endsWith('/user/get')) return { ...success, body: permissionDenied ? { errcode: 60011 } : user ?? { errcode: 60111 } };
    if (path.endsWith('/user/getuserid')) return { ...success, body: { errcode: 60146 } };
    if (path.endsWith('/user/create')) { createCount++; const body = isObject(request.body) ? request.body : {}; user = { errcode: 0, userid: body['userid'], department: body['department'], status: 1 }; return { ...success, body: { errcode: 0 } }; }
    throw new Error(`Unexpected request ${path}`);
  });
});
afterEach(() => vi.restoreAllMocks());

it('uses separate credentials and does not create a member twice', async () => {
  const input = { auth, userid: 'employee-1', name: 'Employee', mobile: '13800000001', departmentId: '2' };
  expect(await wecomContacts.provision(input)).toMatchObject({ userid: 'employee-1', created: true });
  expect(await wecomContacts.provision(input)).toMatchObject({ userid: 'employee-1', created: false });
  expect(createCount).toBe(1);
  expect(tokenKinds).toEqual(expect.arrayContaining(['application-secret', 'contact-secret']));
});

it('does not interpret a visibility denial as a missing user', async () => {
  permissionDenied = true;
  await expect(wecomContacts.provision({ auth, userid: 'employee-2', name: 'Employee', mobile: '13800000002', departmentId: '2' })).rejects.toThrow('visibility scope');
  expect(createCount).toBe(0);
});

it('keeps engine auth properties from overriding the extracted connection credentials', async () => {
  const { wecom } = await import('../src');
  const { createMockActionContext } = await import('@fema-ipaas/connector-sdk');
  const action = wecom.actions()['provision_user'];
  const context: Parameters<typeof action.run>[0] = { ...createMockActionContext({ propsValue: { userid: 'employee-3', name: 'Employee', mobile: '13800000003', departmentId: '2', auth: { type: ConnectionType.CUSTOM_AUTH, props: auth } } }), auth: { type: ConnectionType.CUSTOM_AUTH, props: auth } };
  const result = await action.run(context);
  expect(result).toMatchObject({ userid: 'employee-3', created: true });
});
