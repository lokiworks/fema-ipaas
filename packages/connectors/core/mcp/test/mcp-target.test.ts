/// <reference types="vitest/globals" />

import { ConnectionType } from '@fema-ipaas/connector-sdk';
import { McpAuthType, mcpTarget, McpTransport } from '../src/lib/common/mcp-target';
import { AddressKind, networkAddress } from '../src/lib/common/network-address';

describe('mcpTarget.fromAuth', () => {
  test('keeps legacy connections working as Streamable HTTP with a bearer token', () => {
    expect(mcpTarget.fromAuth({ type: ConnectionType.CUSTOM_AUTH, props: { url: ' https://a/mcp ', token: 'abc' } })).toEqual({
      url: 'https://a/mcp',
      transport: McpTransport.STREAMABLE_HTTP,
      authType: McpAuthType.BEARER,
      authorization: 'abc',
    });
  });

  test('drops the token when authentication is none', () => {
    expect(mcpTarget.fromAuth({ props: { url: 'https://a/sse', transport: 'sse', authType: 'none', token: 'abc' } })).toMatchObject({
      transport: McpTransport.SSE,
      authType: McpAuthType.NONE,
      authorization: undefined,
    });
  });

  test('reads OAuth connections', () => {
    expect(mcpTarget.fromAuth({ access_token: 'tok', props: { url: 'https://a/mcp', transport: 'streamable_http' }, data: {} })).toEqual({
      url: 'https://a/mcp',
      transport: McpTransport.STREAMABLE_HTTP,
      authType: McpAuthType.OAUTH2,
      authorization: 'Bearer tok',
    });
  });
});

describe('networkAddress', () => {
  test.each([
    ['127.0.0.1', AddressKind.LOOPBACK],
    ['::1', AddressKind.LOOPBACK],
    ['0.0.0.0', AddressKind.LOOPBACK],
    ['169.254.169.254', AddressKind.LINK_LOCAL],
    ['fe80::1', AddressKind.LINK_LOCAL],
    ['10.2.3.4', AddressKind.PRIVATE],
    ['172.20.0.1', AddressKind.PRIVATE],
    ['192.168.1.9', AddressKind.PRIVATE],
    ['::ffff:10.0.0.1', AddressKind.PRIVATE],
    ['fd00::1', AddressKind.PRIVATE],
    ['8.8.8.8', AddressKind.PUBLIC],
  ])('classifies %s', (ip, kind) => {
    expect(networkAddress.classifyIp(ip)).toBe(kind);
  });

  test('treats localhost names as loopback', () => {
    expect(networkAddress.classifyHost('api.localhost')).toBe(AddressKind.LOOPBACK);
    expect(networkAddress.classifyHost('[::1]')).toBe(AddressKind.LOOPBACK);
    expect(networkAddress.classifyHost('mcp.example.com')).toBe(AddressKind.PUBLIC);
  });
});
