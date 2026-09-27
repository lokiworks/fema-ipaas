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
  });

  test('maps refused connections', () => {
    const error = new Error('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) });
    expect(classify({ error }).failure).toBe(McpProbeFailure.UNREACHABLE);
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
