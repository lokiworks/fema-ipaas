/**
 * @vitest-environment jsdom
 */
import axios, { InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';
import { tenantContext } from '@/lib/tenant-context';

const captured: InternalAxiosRequestConfig[] = [];
const originalAdapter = axios.defaults.adapter;

function lastHeader(name: string): unknown {
  const config = captured[captured.length - 1];
  return config.headers.get(name) ?? undefined;
}

describe('tenantContext', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    captured.length = 0;
    axios.defaults.adapter = async (config) => {
      captured.push(config);
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };
  });

  afterEach(() => {
    axios.defaults.adapter = originalAdapter;
    vi.restoreAllMocks();
  });

  it('remembers the tenant for the browser session', () => {
    expect(tenantContext.get()).toBeNull();
    tenantContext.set('acme');
    expect(tenantContext.get()).toBe('acme');
    expect(window.sessionStorage.getItem('tenantContext')).toBe('acme');
    tenantContext.clear();
    expect(tenantContext.get()).toBeNull();
  });

  it('builds the tenant sign-in path', () => {
    expect(tenantContext.loginPath('acme')).toBe('/t/acme');
  });

  it('sends the tenant header on requests made without a session', async () => {
    tenantContext.set('acme');
    vi.spyOn(authenticationSession, 'getToken').mockReturnValue(null);

    await api.post('/v1/authentication/sign-in', { email: 'a@b.co' });

    expect(lastHeader('x-fema-tenant')).toBe('acme');
  });

  it('sends the tenant header on sign-in even when a stale token is stored', async () => {
    tenantContext.set('acme');
    vi.spyOn(authenticationSession, 'getToken').mockReturnValue('stale');

    await api.post('/v1/authentication/sms/verify', {
      phone: '+8613800000000',
    });

    expect(lastHeader('x-fema-tenant')).toBe('acme');
    expect(lastHeader('Authorization')).toBeUndefined();
  });

  it('leaves authenticated requests to the token', async () => {
    tenantContext.set('acme');
    vi.spyOn(authenticationSession, 'getToken').mockReturnValue('good');

    await api.get('/v1/users/me/security');

    expect(lastHeader('x-fema-tenant')).toBeUndefined();
    expect(lastHeader('Authorization')).toBe('Bearer good');
  });

  it('sends no tenant header when nothing is remembered', async () => {
    vi.spyOn(authenticationSession, 'getToken').mockReturnValue(null);

    await api.get('/v1/tenants/public/acme');

    expect(lastHeader('x-fema-tenant')).toBeUndefined();
  });
});
