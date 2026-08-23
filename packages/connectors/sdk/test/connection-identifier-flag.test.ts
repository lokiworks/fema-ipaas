import { describe, expect, it } from 'vitest';
import { createConnector } from '../src/lib/connector';
import { ConnectorAuth } from '../src/lib/property';

const build = (auth: Parameters<typeof createConnector>[0]['auth']) =>
  createConnector({
    displayName: 'Test',
    logoUrl: 'https://example.com/logo.png',
    auth,
    actions: [],
    triggers: [],
  }).metadata().auth;

const oauth2 = (extra: Record<string, unknown>) =>
  ConnectorAuth.OAuth2({
    displayName: 'Auth',
    authUrl: 'https://example.com/authorize',
    tokenUrl: 'https://example.com/token',
    required: true,
    scope: [],
    ...extra,
  });

const withHook = () => oauth2({ getConnectionIdentifier: async () => 'alice@corp.com' });

const withoutHook = () => oauth2({});

describe('metadata() derives hasConnectionIdentifier', () => {
  it('is undefined when the connector declares no auth', () => {
    expect(build(undefined)).toBeUndefined();
  });

  it('is false when the auth declares no hook', () => {
    expect(build(withoutHook())).toMatchObject({ hasConnectionIdentifier: false });
  });

  it('is true when the auth declares the hook', () => {
    expect(build(withHook())).toMatchObject({ hasConnectionIdentifier: true });
  });

  it('is derived per entry for an array of auths', () => {
    const auth = build([ConnectorAuth.SecretText({ displayName: 'Token', required: true }), withHook()]);
    expect(Array.isArray(auth) && auth.map((entry) => entry.hasConnectionIdentifier)).toStrictEqual([false, true]);
  });

  it('does not mutate the connector author\'s auth object', () => {
    const original = withoutHook();
    build(original);
    expect('hasConnectionIdentifier' in original).toBe(false);
  });
});
