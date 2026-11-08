import { HttpError, HttpMethod, httpClient } from '@fema-ipaas/connector-common';
import type { HttpRequest } from '@fema-ipaas/connector-common';
import { ConnectionType, connectorContract, createMockActionContext } from '@fema-ipaas/connector-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fema } from '../src';
import { callApi } from '../src/lib/actions/call-api';
import { readObject } from '../src/lib/actions/read-object';

const auth = {
  type: ConnectionType.OAUTH2 as const,
  access_token: 'app-token',
  client_id: 'svc',
  client_secret: 'secret',
  redirect_url: 'no_redirect',
  token_type: 'Bearer',
  claimed_at: 0,
  refresh_token: '',
  scope: '',
  token_url: 'https://iam.example.com/oauth2/token',
  data: {},
  props: { tokenUrl: 'https://iam.example.com/oauth2/token', apiUrl: 'https://api.example.com', tenant: 't_8f2c' },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FEMA actions', () => {
  it('declares complete action metadata', () => {
    expect(connectorContract.violationsOf({ connector: fema })).toEqual([]);
  });

  it('reads an object by path and id with the connection token', async () => {
    const requests: HttpRequest[] = [];
    vi.spyOn(httpClient, 'sendRequest').mockImplementation(async (request) => {
      requests.push(request);
      return { status: 200, headers: {}, body: { code: 'SUCCESS', data: { id: '981233', code: 'HT-2026-0001' } } };
    });
    const output = await readObject.run({
      ...createMockActionContext<typeof readObject.props>({ propsValue: { objectPath: '/rental-agreement/contract/', objectId: ' 981233 ' } }),
      auth,
    });
    expect(output).toEqual({ found: true, objectPath: 'rental-agreement/contract', objectId: '981233', data: { id: '981233', code: 'HT-2026-0001' } });
    expect(requests[0]).toMatchObject({ method: HttpMethod.GET, url: 'https://api.example.com/rental-agreement/contract/find-by-id', queryParams: { id: '981233' }, authentication: { type: 'BEARER_TOKEN', token: 'app-token' } });
  });

  it('reports a missing object instead of failing', async () => {
    vi.spyOn(httpClient, 'sendRequest').mockRejectedValue(new HttpError({}, { status: 404, responseBody: { code: 'NOT_FOUND', message: 'no such contract' } }));
    const output = await readObject.run({
      ...createMockActionContext<typeof readObject.props>({ propsValue: { objectPath: 'rental-agreement/contract', objectId: '1' } }),
      auth,
    });
    expect(output).toEqual({ found: false, objectPath: 'rental-agreement/contract', objectId: '1', data: null });
  });

  it('treats SUCCESS with null data as not found, as FEMA answers find-by-id for a missing object', async () => {
    vi.spyOn(httpClient, 'sendRequest').mockResolvedValue({ status: 200, headers: {}, body: { code: 'SUCCESS', message: null, data: null } });
    const output = await readObject.run({
      ...createMockActionContext<typeof readObject.props>({ propsValue: { objectPath: 'rental-agreement/contract', objectId: '1' } }),
      auth,
    });
    expect(output).toEqual({ found: false, objectPath: 'rental-agreement/contract', objectId: '1', data: null });
  });

  it('fails when the application may not read the object', async () => {
    vi.spyOn(httpClient, 'sendRequest').mockRejectedValue(new HttpError({}, { status: 403, responseBody: { code: 'FORBIDDEN', message: 'no permission' } }));
    await expect(readObject.run({
      ...createMockActionContext<typeof readObject.props>({ propsValue: { objectPath: 'rental-agreement/contract', objectId: '1' } }),
      auth,
    })).rejects.toThrow(/HTTP 403，FORBIDDEN/);
  });

  it('rejects an object path that is not app/object', async () => {
    await expect(readObject.run({
      ...createMockActionContext<typeof readObject.props>({ propsValue: { objectPath: 'https://evil.example.com/x', objectId: '1' } }),
      auth,
    })).rejects.toThrow(/对象地址/);
  });

  it('calls any FEMA API and returns the data', async () => {
    const requests: HttpRequest[] = [];
    vi.spyOn(httpClient, 'sendRequest').mockImplementation(async (request) => {
      requests.push(request);
      return { status: 200, headers: {}, body: { code: 'SUCCESS', data: { content: [], total: 0 } } };
    });
    const output = await callApi.run({
      ...createMockActionContext<typeof callApi.props>({ propsValue: { method: HttpMethod.POST, path: 'rental-agreement/contract/find-all', queryParams: { page: 1, empty: '' }, body: { size: 10 } } }),
      auth,
    });
    expect(output).toEqual({ content: [], total: 0 });
    expect(requests[0]).toMatchObject({ method: HttpMethod.POST, url: 'https://api.example.com/rental-agreement/contract/find-all', queryParams: { page: '1' }, body: { size: 10 } });
  });

  it('sends GET without a body and refuses paths that leave the API', async () => {
    const requests: HttpRequest[] = [];
    vi.spyOn(httpClient, 'sendRequest').mockImplementation(async (request) => {
      requests.push(request);
      return { status: 200, headers: {}, body: { code: 'SUCCESS', data: 1 } };
    });
    await callApi.run({ ...createMockActionContext<typeof callApi.props>({ propsValue: { method: HttpMethod.GET, path: 'a/b/find-by-id', queryParams: { id: 'x' }, body: undefined } }), auth });
    expect(requests[0].body).toBeUndefined();
    await expect(callApi.run({ ...createMockActionContext<typeof callApi.props>({ propsValue: { method: HttpMethod.GET, path: 'https://other.example.com/x', queryParams: undefined, body: undefined } }), auth })).rejects.toThrow(/接口路径/);
    await expect(callApi.run({ ...createMockActionContext<typeof callApi.props>({ propsValue: { method: HttpMethod.GET, path: '../../admin', queryParams: undefined, body: undefined } }), auth })).rejects.toThrow(/接口路径/);
  });

  it('falls back to the origin of the token URL when the API URL is empty', async () => {
    const requests: HttpRequest[] = [];
    vi.spyOn(httpClient, 'sendRequest').mockImplementation(async (request) => {
      requests.push(request);
      return { status: 200, headers: {}, body: { code: 'SUCCESS', data: null } };
    });
    await callApi.run({ ...createMockActionContext<typeof callApi.props>({ propsValue: { method: HttpMethod.GET, path: 'a/b/c', queryParams: undefined, body: undefined } }), auth: { ...auth, props: { ...auth.props, apiUrl: '' } } });
    expect(requests[0].url).toBe('https://iam.example.com/a/b/c');
  });
});
