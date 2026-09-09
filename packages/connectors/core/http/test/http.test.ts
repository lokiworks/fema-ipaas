/// <reference types="vitest/globals" />

import { FetchHttpClient, HttpMethod } from '@fema-ipaas/connector-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PROXY_ENV_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];

function stubFetch() {
  const spy = vi.fn().mockResolvedValue(
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function initOf(spy: ReturnType<typeof stubFetch>) {
  return spy.mock.calls[0][1];
}

describe('FetchHttpClient proxying', () => {
  beforeEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of PROXY_ENV_KEYS) {
      delete process.env[key];
    }
  });

  it('sends no dispatcher on a plain request', async () => {
    const spy = stubFetch();

    await new FetchHttpClient().sendRequest({
      method: HttpMethod.GET,
      url: 'https://api.example.com/data',
    });

    expect(initOf(spy).dispatcher).toBeUndefined();
  });

  it('ignores the ambient proxy environment, so egress stays under the engine SSRF guards', async () => {
    const spy = stubFetch();
    process.env['HTTPS_PROXY'] = 'http://127.0.0.1:4444';
    process.env['HTTP_PROXY'] = 'http://127.0.0.1:4444';
    process.env['https_proxy'] = 'http://127.0.0.1:4444';

    await new FetchHttpClient().sendRequest({
      method: HttpMethod.GET,
      url: 'https://api.example.com/data',
    });

    expect(initOf(spy).dispatcher).toBeUndefined();
  });

  it('uses the dispatcher the caller supplies, which is how the HTTP connector proxies a request', async () => {
    const spy = stubFetch();
    const dispatcher = { marker: 'caller-supplied-proxy-agent' };

    await new FetchHttpClient().sendRequest(
      { method: HttpMethod.GET, url: 'https://api.example.com/data' },
      { dispatcher },
    );

    expect(initOf(spy).dispatcher).toBe(dispatcher);
  });

  it('opts out of certificate verification only when the request asks for it', async () => {
    const spy = stubFetch();

    await new FetchHttpClient().sendRequest({
      method: HttpMethod.GET,
      url: 'https://api.example.com/data',
      rejectUnauthorized: false,
    });

    expect(initOf(spy).dispatcher).toBeDefined();
  });
});
