/// <reference types="vitest/globals" />

import { McpHttpError, McpTimeoutError } from '../src/lib/common/mcp-client';
import { McpProbeFailure, mcpProbe } from '../src/lib/common/mcp-probe';
import { McpAuthType, McpTarget, McpTransport } from '../src/lib/common/mcp-target';
import { fakeHttp } from './fake-http';

describe('mcpProbe.probe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('refuses loopback addresses before touching the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await mcpProbe.probe({ target: target({ url: 'http://127.0.0.1:8080/mcp' }) });
    expect(result).toMatchObject({ ok: false, error: { failure: McpProbeFailure.LOOPBACK, host: '127.0.0.1:8080' } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('treats localhost as the worker itself', async () => {
    const result = await mcpProbe.probe({ target: target({ url: 'http://localhost:3000/mcp' }) });
    expect(result).toMatchObject({ ok: false, error: { failure: McpProbeFailure.LOOPBACK } });
  });

  test('refuses the cloud metadata range', async () => {
    const result = await mcpProbe.probe({ target: target({ url: 'http://169.254.169.254/latest' }) });
    expect(result).toMatchObject({ ok: false, error: { failure: McpProbeFailure.LINK_LOCAL } });
  });

  test('refuses hostnames that resolve to loopback', async () => {
    const result = await mcpProbe.probe({
      target: target({ url: 'https://sneaky.example.com/mcp' }),
      resolveHost: async () => ['127.0.0.1'],
    });
    expect(result).toMatchObject({ ok: false, error: { failure: McpProbeFailure.LOOPBACK } });
  });

  test('reports DNS failures', async () => {
    const result = await mcpProbe.probe({
      target: target({ url: 'https://nowhere.invalid/mcp' }),
      resolveHost: async () => {
        throw Object.assign(new Error('getaddrinfo ENOTFOUND nowhere.invalid'), { code: 'ENOTFOUND' });
      },
    });
    expect(result).toMatchObject({ ok: false, error: { failure: McpProbeFailure.DNS } });
  });

  test('lists tools and measures latency on success', async () => {
    fakeHttp.install({
      routes: {
        'https://mcp.example.com/mcp': fakeHttp.mcpServer({
          sessionId: 's-1',
          tools: [{ name: 'search_pages', description: 'Search the knowledge base' }],
          onCall: () => ({}),
        }),
      },
    });
    const result = await mcpProbe.probe({
      target: target({ url: 'https://mcp.example.com/mcp' }),
      resolveHost: async () => ['93.184.216.34'],
    });
    expect(result).toMatchObject({ ok: true, insecureHttp: false, tools: [{ name: 'search_pages' }] });
  });

  test('flags plain http on public addresses', async () => {
    fakeHttp.install({
      routes: {
        'http://mcp.example.com/mcp': fakeHttp.mcpServer({ sessionId: 's-2', tools: [], onCall: () => ({}) }),
      },
    });
    const result = await mcpProbe.probe({
      target: target({ url: 'http://mcp.example.com/mcp' }),
      resolveHost: async () => ['93.184.216.34'],
    });
    expect(result).toMatchObject({ ok: true, insecureHttp: true });
  });
});

describe('mcpProbe.probe address bypasses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each([
    ['IPv6 loopback', 'http://[::1]:8080/mcp'],
    ['IPv6 loopback, expanded', 'http://[0:0:0:0:0:0:0:1]:8080/mcp'],
    ['IPv4-mapped IPv6 loopback', 'http://[::ffff:127.0.0.1]:8080/mcp'],
    ['IPv4-mapped IPv6 loopback, hex groups', 'http://[::ffff:7f00:1]:8080/mcp'],
    ['decimal IPv4', 'http://2130706433:8080/mcp'],
    ['hexadecimal IPv4', 'http://0x7f000001:8080/mcp'],
    ['octal IPv4', 'http://0177.0.0.1:8080/mcp'],
    ['short IPv4', 'http://127.1:8080/mcp'],
    ['unspecified address', 'http://0.0.0.0:8080/mcp'],
    ['localhost with a trailing dot', 'http://localhost.:8080/mcp'],
  ])('refuses %s without touching the network', async (_name, url) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await mcpProbe.probe({
      target: target({ url }),
      allowList: [],
      resolveHost: async () => ['127.0.0.1'],
    });
    expect(result).toMatchObject({ ok: false, error: { failure: McpProbeFailure.LOOPBACK } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test.each([
    ['IPv4-mapped metadata address', 'http://[::ffff:169.254.169.254]/latest'],
    ['decimal metadata address', 'http://2852039166/latest'],
    ['hexadecimal metadata address', 'http://0xa9fea9fe/latest'],
    ['IPv6 link-local', 'http://[fe80::1]/latest'],
  ])('refuses %s as link-local', async (_name, url) => {
    const result = await mcpProbe.probe({ target: target({ url }), allowList: [] });
    expect(result).toMatchObject({ ok: false, error: { failure: McpProbeFailure.LINK_LOCAL } });
  });

  test('refuses a hostname that rebinds to loopback on a later lookup', async () => {
    const lookups = [['93.184.216.34'], ['127.0.0.1']];
    const resolveHost = async () => lookups.shift() ?? ['127.0.0.1'];
    const first = await mcpProbe.probe({ target: target({ url: 'https://rebind.example.com/mcp' }), allowList: [], resolveHost }).catch(() => null);
    const second = await mcpProbe.probe({ target: target({ url: 'https://rebind.example.com/mcp' }), allowList: [], resolveHost });
    expect(first).not.toMatchObject({ ok: false, error: { failure: McpProbeFailure.LOOPBACK } });
    expect(second).toMatchObject({ ok: false, error: { failure: McpProbeFailure.LOOPBACK } });
  });

  test('refuses a hostname with one public and one loopback record', async () => {
    const result = await mcpProbe.probe({
      target: target({ url: 'https://mixed.example.com/mcp' }),
      allowList: [],
      resolveHost: async () => ['93.184.216.34', '::1'],
    });
    expect(result).toMatchObject({ ok: false, error: { failure: McpProbeFailure.LOOPBACK } });
  });
});

describe('mcpProbe.probe allow list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('lets an allow-listed loopback address through', async () => {
    fakeHttp.install({
      routes: { 'http://127.0.0.1:8080/mcp': fakeHttp.mcpServer({ sessionId: 's-3', tools: [{ name: 'ping', description: 'Ping' }], onCall: () => ({}) }) },
    });
    const result = await mcpProbe.probe({ target: target({ url: 'http://127.0.0.1:8080/mcp' }), allowList: ['127.0.0.1'] });
    expect(result).toMatchObject({ ok: true, tools: [{ name: 'ping' }] });
  });

  test('lets an address inside an allow-listed range through', async () => {
    fakeHttp.install({
      routes: { 'http://127.0.0.5:8080/mcp': fakeHttp.mcpServer({ sessionId: 's-4', tools: [], onCall: () => ({}) }) },
    });
    const result = await mcpProbe.probe({ target: target({ url: 'http://127.0.0.5:8080/mcp' }), allowList: ['127.0.0.0/8'] });
    expect(result).toMatchObject({ ok: true });
  });

  test('matches the allow list through the IPv4-mapped spelling', async () => {
    fakeHttp.install({
      routes: { 'http://[::ffff:127.0.0.1]:8080/mcp': fakeHttp.mcpServer({ sessionId: 's-5', tools: [], onCall: () => ({}) }) },
    });
    const result = await mcpProbe.probe({ target: target({ url: 'http://[::ffff:127.0.0.1]:8080/mcp' }), allowList: ['127.0.0.1'] });
    expect(result).toMatchObject({ ok: true });
  });

  test('still refuses loopback addresses that are not on the list', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await mcpProbe.probe({ target: target({ url: 'http://127.0.0.1:8080/mcp' }), allowList: ['203.0.113.9'] });
    expect(result).toMatchObject({ ok: false, error: { failure: McpProbeFailure.LOOPBACK } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('allowing 127.0.0.1 does not allow the rest of the loopback range or the metadata range', async () => {
    const other = await mcpProbe.probe({ target: target({ url: 'http://127.0.0.2:8080/mcp' }), allowList: ['127.0.0.1'] });
    const metadata = await mcpProbe.probe({ target: target({ url: 'http://169.254.169.254/latest' }), allowList: ['127.0.0.1'] });
    expect(other).toMatchObject({ ok: false, error: { failure: McpProbeFailure.LOOPBACK } });
    expect(metadata).toMatchObject({ ok: false, error: { failure: McpProbeFailure.LINK_LOCAL } });
  });

  test('allows a hostname only when every resolved address is allowed', async () => {
    const result = await mcpProbe.probe({
      target: target({ url: 'https://mixed.example.com/mcp' }),
      allowList: ['127.0.0.1'],
      resolveHost: async () => ['127.0.0.1', '::1'],
    });
    expect(result).toMatchObject({ ok: false, error: { failure: McpProbeFailure.LOOPBACK } });
  });

  test('reads the allow list from FEMA_SSRF_ALLOW_LIST by default', async () => {
    vi.stubEnv('FEMA_SSRF_ALLOW_LIST', '10.0.0.0/8, 127.0.0.1');
    fakeHttp.install({
      routes: { 'http://127.0.0.1:8080/mcp': fakeHttp.mcpServer({ sessionId: 's-6', tools: [], onCall: () => ({}) }) },
    });
    const result = await mcpProbe.probe({ target: target({ url: 'http://127.0.0.1:8080/mcp' }) });
    vi.unstubAllEnvs();
    expect(result).toMatchObject({ ok: true });
  });
});

describe('mcpProbe.classifyError', () => {
  test('maps 405 to a transport mismatch', () => {
    const error = new McpHttpError({ url: 'https://x/sse', status: 405, body: 'Method Not Allowed' });
    expect(classify({ error }).failure).toBe(McpProbeFailure.TRANSPORT_MISMATCH);
  });

  test('maps 401 to an invalid token', () => {
    const error = new McpHttpError({ url: 'https://x/mcp', status: 401, body: '' });
    expect(classify({ error }).failure).toBe(McpProbeFailure.UNAUTHORIZED);
  });

  test('maps 401 on an OAuth server without a token to not authorized', () => {
    const error = new McpHttpError({ url: 'https://x/mcp', status: 401, body: '' });
    const result = mcpProbe.classifyError({
      error,
      target: target({ url: 'https://x/mcp', authType: McpAuthType.OAUTH2, authorization: undefined }),
      host: 'x',
      privateAddress: false,
    });
    expect(result.failure).toBe(McpProbeFailure.OAUTH_NOT_AUTHORIZED);
  });

  test('maps timeouts on private addresses to the allow-list hint', () => {
    expect(classify({ error: new McpTimeoutError('http://10.0.0.5/mcp'), privateAddress: true }).failure).toBe(McpProbeFailure.PRIVATE_UNREACHABLE);
    expect(classify({ error: new McpTimeoutError('https://x/mcp'), privateAddress: false }).failure).toBe(McpProbeFailure.TIMEOUT);
  });

  test('maps an SSRF guard block to the allow-list hint', () => {
    const error = new Error('fetch failed', { cause: Object.assign(new Error('Blocked by SSRF protection'), { name: 'SSRFBlockedError' }) });
    expect(classify({ error }).failure).toBe(McpProbeFailure.PRIVATE_UNREACHABLE);
    expect(classify({ error }).detail).toBe('Blocked by SSRF protection');
  });

  test('maps refused connections', () => {
    const error = new Error('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) });
    expect(classify({ error }).failure).toBe(McpProbeFailure.UNREACHABLE);
    expect(classify({ error, privateAddress: true }).failure).toBe(McpProbeFailure.UNREACHABLE);
  });

  test('maps unroutable private addresses to the allow-list hint', () => {
    const error = new Error('fetch failed', { cause: Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH' }) });
    expect(classify({ error, privateAddress: true }).failure).toBe(McpProbeFailure.PRIVATE_UNREACHABLE);
  });
});

function classify({ error, privateAddress = false }: { error: unknown; privateAddress?: boolean }) {
  return mcpProbe.classifyError({ error, target: target({ url: 'https://x/mcp' }), host: 'x', privateAddress });
}

function target(overrides: Partial<McpTarget> & { url: string }): McpTarget {
  return {
    transport: McpTransport.STREAMABLE_HTTP,
    authType: McpAuthType.BEARER,
    authorization: 'token',
    ...overrides,
  };
}
