/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';

import { loginRedirect } from '@/lib/login-redirect';

describe('loginRedirect.safePath', () => {
  it('keeps in-app paths with their query and hash', () => {
    expect(loginRedirect.safePath('/projects/p1/issues/i1?tab=runs#top')).toBe(
      '/projects/p1/issues/i1?tab=runs#top',
    );
  });

  it('rejects anything that could leave the app', () => {
    [
      'https://evil.example/x',
      '//evil.example/x',
      '/\\evil.example',
      'javascript:alert(1)',
      'projects/p1',
      '',
      null,
      undefined,
    ].forEach((raw) => expect(loginRedirect.safePath(raw)).toBeNull());
  });

  it('never sends the user back to an auth page', () => {
    [
      '/sign-in?from=/x',
      '/sign-up',
      '/sso/complete?ticket=t',
      '/invitation?token=x',
    ].forEach((raw) => expect(loginRedirect.safePath(raw)).toBeNull());
  });
});

describe('loginRedirect.signInPath', () => {
  it('carries the deep link as an encoded from parameter', () => {
    expect(loginRedirect.signInPath('/projects/p1/issues/i1?x=1')).toBe(
      '/sign-in?from=%2Fprojects%2Fp1%2Fissues%2Fi1%3Fx%3D1',
    );
  });

  it('drops unsafe or empty targets', () => {
    expect(loginRedirect.signInPath('https://evil.example')).toBe('/sign-in');
    expect(loginRedirect.signInPath('/')).toBe('/sign-in');
  });
});

describe('loginRedirect.consume', () => {
  afterEach(() => window.sessionStorage.clear());

  it('prefers the from parameter and falls back to home', () => {
    expect(loginRedirect.consume({ requested: '/logs' })).toBe('/logs');
    expect(loginRedirect.consume({ requested: 'https://evil.example' })).toBe(
      '/',
    );
  });

  it('restores the target remembered before an SSO round trip, once', () => {
    loginRedirect.rememberForExternalSignIn('/projects/p1/home');
    expect(loginRedirect.consume({ requested: null })).toBe(
      '/projects/p1/home',
    );
    expect(loginRedirect.consume({ requested: null })).toBe('/');
  });

  it('does not remember unsafe targets', () => {
    loginRedirect.rememberForExternalSignIn('//evil.example');
    expect(loginRedirect.consume({ requested: null })).toBe('/');
  });
});
