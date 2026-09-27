import { describe, expect, it } from 'vitest';

import { authOAuthUtils } from '@/features/connector-blueprints/components/auth/auth-oauth-utils';

describe('authOAuthUtils', () => {
  it('computes the RFC 7636 PKCE S256 code challenge for a known verifier', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await authOAuthUtils.codeChallengeOf(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('generates a code verifier of the expected length and charset', () => {
    const verifier = authOAuthUtils.generateCodeVerifier();
    expect(verifier).toHaveLength(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('builds an authorization url with response_type=code and the given params', () => {
    const url = authOAuthUtils.buildAuthorizationUrl({
      authorizeUrl: 'https://example.com/oauth/authorize',
      clientId: 'client-123',
      redirectUrl: 'https://app.local/redirect',
      scope: 'read write',
      state: 'state-abc',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('client-123');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://app.local/redirect',
    );
    expect(parsed.searchParams.get('scope')).toBe('read write');
    expect(parsed.searchParams.get('state')).toBe('state-abc');
    expect(parsed.searchParams.has('code_challenge')).toBe(false);
  });

  it('omits scope when empty and adds PKCE params when a code challenge is given', () => {
    const url = authOAuthUtils.buildAuthorizationUrl({
      authorizeUrl: 'https://example.com/oauth/authorize',
      clientId: 'client-123',
      redirectUrl: 'https://app.local/redirect',
      scope: '',
      state: 'state-abc',
      codeChallenge: 'challenge-xyz',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.has('scope')).toBe(false);
    expect(parsed.searchParams.get('code_challenge')).toBe('challenge-xyz');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('produces a full authorization request with a matching code challenge when pkce is enabled', async () => {
    const request = await authOAuthUtils.authorizationRequestOf({
      authorizeUrl: 'https://example.com/oauth/authorize',
      clientId: 'client-123',
      redirectUrl: 'https://app.local/redirect',
      scope: '',
      pkce: true,
    });
    expect(request.codeVerifier).toBeDefined();
    const parsed = new URL(request.authorizationUrl);
    const expectedChallenge = await authOAuthUtils.codeChallengeOf(
      request.codeVerifier ?? '',
    );
    expect(parsed.searchParams.get('code_challenge')).toBe(expectedChallenge);
  });

  it('does not include PKCE params when pkce is disabled', async () => {
    const request = await authOAuthUtils.authorizationRequestOf({
      authorizeUrl: 'https://example.com/oauth/authorize',
      clientId: 'client-123',
      redirectUrl: 'https://app.local/redirect',
      scope: '',
      pkce: false,
    });
    expect(request.codeVerifier).toBeUndefined();
    const parsed = new URL(request.authorizationUrl);
    expect(parsed.searchParams.has('code_challenge')).toBe(false);
  });
});
