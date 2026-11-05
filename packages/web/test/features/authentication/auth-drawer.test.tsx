/**
 * @vitest-environment jsdom
 */
import { ErrorCode } from '@fema-ipaas/core-utils';
import { PublicTenantInfo } from '@fema-ipaas/shared';
import { AxiosError, AxiosHeaders } from 'axios';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthDrawerBody } from '@/features/authentication/components/auth-landing/auth-drawer-body';
import { TenantLoginContext } from '@/features/authentication/components/auth-landing/tenant-login-context';

import { renderHarness } from './render-harness';

const mocks = vi.hoisted(() => ({
  discoverTenants: vi.fn(),
  requestEmailCode: vi.fn(),
  verifyEmailCode: vi.fn(),
  ssoProviders: vi.fn(),
  flags: {} as Record<string, unknown>,
}));

vi.mock('@/api/authentication-api', () => ({
  authenticationApi: {
    discoverTenants: mocks.discoverTenants,
    requestEmailCode: mocks.requestEmailCode,
    verifyEmailCode: mocks.verifyEmailCode,
    ssoProviders: mocks.ssoProviders,
  },
}));

vi.mock('@/hooks/flags-hooks', () => ({
  flagsHooks: {
    useFlag: (flagId: string) => ({ data: mocks.flags[flagId] }),
    useWebsiteBranding: () => ({
      websiteName: 'Brand',
      welcomeText: null,
      logos: {
        logoIconUrl: '/icon.svg',
        fullLogoUrl: '/assets/full-logo.svg',
      },
    }),
  },
}));

vi.mock('@/components/providers/telemetry-provider', () => ({
  useTelemetry: () => ({ capture: vi.fn() }),
}));

vi.mock('@/lib/navigation-utils', () => ({
  useRedirectAfterLogin: () => vi.fn(),
  FROM_QUERY_PARAM: 'from',
}));

vi.mock('@/lib/authentication-session', () => ({
  authenticationSession: {
    saveResponse: vi.fn(),
    isOnboarding: () => false,
    clearSession: vi.fn(),
  },
}));

vi.mock(
  '@/features/authentication/components/auth-landing/captcha-widget',
  () => ({
    CaptchaWidget: ({ onToken }: { onToken: (token: string) => void }) => {
      useEffect(() => {
        onToken('captcha-token');
      }, [onToken]);
      return null;
    },
  }),
);

function serverError(data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('failed', undefined, config, undefined, {
    status: 409,
    statusText: '',
    headers: {},
    config,
    data,
  });
}

function tenantInfo(overrides: Partial<PublicTenantInfo>): PublicTenantInfo {
  return {
    id: 'tenant-a',
    slug: 'acme',
    name: 'Acme Ltd',
    logoIconUrl: '',
    fullLogoUrl: '',
    primaryColor: '#2563eb',
    welcomeText: null,
    emailAuthEnabled: true,
    phoneAuthEnabled: true,
    ssoProviders: [],
    ...overrides,
  };
}

const harness = renderHarness.createHarness();

describe('AuthDrawerBody', () => {
  beforeEach(() => {
    mocks.discoverTenants.mockReset();
    mocks.requestEmailCode.mockReset();
    mocks.verifyEmailCode.mockReset();
    mocks.ssoProviders.mockReset();
    mocks.ssoProviders.mockResolvedValue({ providers: [] });
    window.sessionStorage.clear();
    mocks.flags = {
      EMAIL_AUTH_ENABLED: true,
      SMTP_CONFIGURED: true,
      USER_CREATED: true,
    };
    harness.mount();
  });

  afterEach(async () => {
    await harness.unmount();
  });

  async function submitEmail(email: string) {
    await harness.waitFor('[data-testid="auth-email"]');
    await harness.type({
      selector: '[data-testid="auth-email"]',
      value: email,
    });
    await harness.click('[data-testid="auth-continue"]');
  }

  describe('email discovery in a multi-tenant instance', () => {
    beforeEach(() => {
      mocks.flags = { ...mocks.flags, MULTI_TENANT: true };
    });

    it('shows the matching single sign-on before sending a code', async () => {
      mocks.discoverTenants.mockResolvedValue({
        tenants: [
          tenantInfo({
            ssoProviders: [{ provider: 'OIDC', label: 'Acme ID' }],
          }),
        ],
      });
      mocks.requestEmailCode.mockResolvedValue(undefined);
      await harness.render(<AuthDrawerBody initialMode="signin" />);

      await submitEmail('dev@acme.com');
      await harness.waitFor('[data-testid="tenant-discovery-acme"]');

      expect(mocks.discoverTenants.mock.calls[0][0]).toEqual({
        email: 'dev@acme.com',
      });
      expect(mocks.requestEmailCode).not.toHaveBeenCalled();

      await harness.click('[data-testid="auth-continue"]');

      expect(mocks.requestEmailCode).toHaveBeenCalledTimes(1);
      expect(mocks.requestEmailCode.mock.calls[0][0]).toEqual({
        email: 'dev@acme.com',
        captchaToken: 'captcha-token',
      });
    });

    it('goes straight to the code when no tenant has single sign-on', async () => {
      mocks.discoverTenants.mockResolvedValue({ tenants: [tenantInfo({})] });
      mocks.requestEmailCode.mockResolvedValue(undefined);
      await harness.render(<AuthDrawerBody initialMode="signin" />);

      await submitEmail('dev@plain.com');
      await harness.waitFor('[data-testid="auth-code"]');

      expect(mocks.requestEmailCode).toHaveBeenCalledTimes(1);
    });

    it('still lets the person sign in when discovery fails', async () => {
      mocks.discoverTenants.mockRejectedValue(new Error('offline'));
      mocks.requestEmailCode.mockResolvedValue(undefined);
      await harness.render(<AuthDrawerBody initialMode="signin" />);

      await submitEmail('dev@acme.com');
      await harness.waitFor('[data-testid="auth-code"]');

      expect(mocks.requestEmailCode).toHaveBeenCalledTimes(1);
    });
  });

  it('does not run discovery on a single-tenant instance', async () => {
    mocks.requestEmailCode.mockResolvedValue(undefined);
    await harness.render(<AuthDrawerBody initialMode="signin" />);

    await submitEmail('dev@acme.com');
    await harness.waitFor('[data-testid="auth-code"]');

    expect(mocks.discoverTenants).not.toHaveBeenCalled();
  });

  it('does not run discovery once a tenant is chosen', async () => {
    mocks.flags = { ...mocks.flags, MULTI_TENANT: true };
    mocks.requestEmailCode.mockResolvedValue(undefined);
    await harness.render(
      <TenantLoginContext.Provider value={tenantInfo({})}>
        <AuthDrawerBody initialMode="signin" />
      </TenantLoginContext.Provider>,
    );

    await submitEmail('dev@acme.com');
    await harness.waitFor('[data-testid="auth-code"]');

    expect(mocks.discoverTenants).not.toHaveBeenCalled();
  });

  describe('phone sign-in', () => {
    it('is hidden until the instance has text messaging', async () => {
      await harness.render(<AuthDrawerBody initialMode="signin" />);
      await harness.waitFor('[data-testid="auth-email"]');

      expect(harness.query('[data-testid="auth-use-phone"]')).toBeNull();
    });

    it('opens the phone step when text messaging is available', async () => {
      mocks.flags = { ...mocks.flags, SMS_AUTH_AVAILABLE: true };
      await harness.render(<AuthDrawerBody initialMode="signin" />);
      await harness.waitFor('[data-testid="auth-use-phone"]');

      await harness.click('[data-testid="auth-use-phone"]');

      await harness.waitFor('[data-testid="sms-phone"]');
      expect(harness.query('[data-testid="sms-phone"]')).not.toBeNull();
    });

    it('is hidden for a tenant that turned it off', async () => {
      mocks.flags = { ...mocks.flags, SMS_AUTH_AVAILABLE: true };
      await harness.render(
        <TenantLoginContext.Provider
          value={tenantInfo({ phoneAuthEnabled: false })}
        >
          <AuthDrawerBody initialMode="signin" />
        </TenantLoginContext.Provider>,
      );
      await harness.waitFor('[data-testid="auth-email"]');

      expect(harness.query('[data-testid="auth-use-phone"]')).toBeNull();
    });

    it('is the way in for a tenant that only allows the phone', async () => {
      mocks.flags = { ...mocks.flags, SMS_AUTH_AVAILABLE: true };
      await harness.render(
        <TenantLoginContext.Provider
          value={tenantInfo({ emailAuthEnabled: false })}
        >
          <AuthDrawerBody initialMode="signin" />
        </TenantLoginContext.Provider>,
      );
      await harness.waitFor('[data-testid="auth-use-phone"]');

      expect(harness.query('[data-testid="auth-email"]')).toBeNull();
    });
  });

  describe('challenges after the code is entered', () => {
    async function reachCodeStep() {
      mocks.requestEmailCode.mockResolvedValue(undefined);
      await harness.render(<AuthDrawerBody initialMode="signin" />);
      await submitEmail('dev@acme.com');
      await harness.waitFor('[data-testid="auth-code"]');
    }

    async function enterCode() {
      await harness.type({
        selector: '[data-testid="auth-code"]',
        value: '123456',
      });
    }

    it('moves to the two-step verification screen', async () => {
      mocks.verifyEmailCode.mockRejectedValue(
        serverError({
          code: ErrorCode.MFA_REQUIRED,
          params: { challengeToken: 'challenge-1' },
        }),
      );
      await reachCodeStep();

      await enterCode();

      await harness.waitFor('[data-testid="mfa-toggle-mode"]');
      expect(harness.query('[data-testid="mfa-toggle-mode"]')).not.toBeNull();
    });

    it('moves to the forced enrollment screen', async () => {
      mocks.verifyEmailCode.mockRejectedValue(
        serverError({
          code: ErrorCode.MFA_ENROLLMENT_REQUIRED,
          params: { challengeToken: 'enroll-1' },
        }),
      );
      await reachCodeStep();

      await enterCode();

      await harness.waitFor('[data-testid="mfa-start"]');
      expect(harness.query('[data-testid="mfa-start"]')).not.toBeNull();
    });

    it('moves to the tenant list', async () => {
      mocks.verifyEmailCode.mockRejectedValue(
        serverError({
          code: ErrorCode.TENANT_SELECTION_REQUIRED,
          params: { selectionToken: 'sel-1' },
        }),
      );
      await reachCodeStep();

      await enterCode();

      await harness.waitFor('[data-testid="tenant-selection-list"]');
      expect(
        harness.query('[data-testid="tenant-selection-list"]'),
      ).not.toBeNull();
    });

    it('says the organization is suspended', async () => {
      mocks.verifyEmailCode.mockRejectedValue(
        serverError({ code: ErrorCode.TENANT_SUSPENDED, params: {} }),
      );
      await reachCodeStep();

      await enterCode();
      await harness.flush();

      expect(harness.text()).toContain('suspended');
    });
  });
});
