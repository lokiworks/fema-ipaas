/**
 * @vitest-environment jsdom
 */
import { ErrorCode } from '@fema-ipaas/core-utils';
import {
  PublicTenantInfo,
  SsoProvider,
  SsoProviderOption,
  SsoScope,
} from '@fema-ipaas/shared';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PowCaptchaWidget } from '@/features/authentication/components/auth-landing/pow-captcha-widget';
import { MfaEnrollmentFlow } from '@/features/authentication/components/mfa-enrollment-flow';
import { SignInForm } from '@/features/authentication/components/sign-in-form';
import { SsoLoginOptions } from '@/features/authentication/components/sso-login-options';
import { TenantDiscoveryPanel } from '@/features/authentication/components/tenant-discovery-panel';

import { renderHarness } from './render-harness';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  discoverTenants: vi.fn(),
  startMfaEnrollment: vi.fn(),
  confirmMfaEnrollment: vi.fn(),
  captchaChallenge: vi.fn(),
  solveInWorker: vi.fn(),
  flags: {} as Record<string, unknown>,
}));

vi.mock('@/api/authentication-api', () => ({
  authenticationApi: {
    signIn: mocks.signIn,
    discoverTenants: mocks.discoverTenants,
    startMfaEnrollment: mocks.startMfaEnrollment,
    confirmMfaEnrollment: mocks.confirmMfaEnrollment,
    captchaChallenge: mocks.captchaChallenge,
  },
}));

vi.mock('@/hooks/flags-hooks', () => ({
  flagsHooks: {
    useFlag: (flagId: string) => ({ data: mocks.flags[flagId] }),
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
  authenticationSession: { saveResponse: vi.fn(), getToken: () => null },
}));

vi.mock('@/features/authentication/components/qr-code', () => ({
  QrCode: ({ value }: { value: string }) => (
    <div data-testid="qr-code" data-value={value} />
  ),
}));

vi.mock('@/components/custom/clipboard/copy-to-clipboard', () => ({
  CopyToClipboardInput: ({ textToCopy }: { textToCopy: string }) => (
    <pre data-testid="copy-value">{textToCopy}</pre>
  ),
}));

vi.mock(
  '@/features/authentication/utils/captcha-utils',
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import('@/features/authentication/utils/captcha-utils')
    >();
    return {
      captchaUtils: {
        ...actual.captchaUtils,
        solveInWorker: mocks.solveInWorker,
      },
    };
  },
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
    phoneAuthEnabled: false,
    ssoProviders: [],
    ...overrides,
  };
}

const harness = renderHarness.createHarness();

describe('login flows', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      if (typeof mock === 'function') {
        mock.mockReset();
      }
    });
    mocks.flags = {};
    document.elementFromPoint = () => null;
    harness.mount();
  });

  afterEach(async () => {
    await harness.unmount();
  });

  describe('MfaEnrollmentFlow', () => {
    async function enterCode(value: string) {
      await harness.type({
        selector: '[data-testid="mfa-enroll-code"]',
        value,
      });
    }

    it('walks through QR scan, confirmation and recovery codes', async () => {
      mocks.startMfaEnrollment.mockResolvedValue({
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP',
      });
      mocks.confirmMfaEnrollment.mockResolvedValue({
        recoveryCodes: ['aaaa-1111', 'bbbb-2222'],
        authentication: {
          token: 'session',
          projectId: 'p',
          id: 'user-1',
          tenantRole: 'ADMIN',
          status: 'ACTIVE',
          externalId: null,
          tenantId: 'tenant-a',
          verified: true,
          firstName: 'A',
          lastName: 'B',
          email: 'a@b.co',
          trackEvents: false,
          newsLetter: false,
        },
      });
      const onCompleted = vi.fn();
      await harness.render(
        <MfaEnrollmentFlow
          challengeToken="enroll-1"
          onCompleted={onCompleted}
        />,
      );

      await harness.click('[data-testid="mfa-start"]');
      expect(mocks.startMfaEnrollment.mock.calls[0][0]).toEqual({
        challengeToken: 'enroll-1',
      });
      expect(
        harness.query('[data-testid="qr-code"]')?.getAttribute('data-value'),
      ).toBe('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP');
      expect(harness.text()).toContain('Or enter this key manually');

      await enterCode('123456');
      expect(mocks.confirmMfaEnrollment.mock.calls[0][0]).toEqual({
        challengeToken: 'enroll-1',
        code: '123456',
      });
      expect(harness.query('[data-testid="copy-value"]')?.textContent).toBe(
        'aaaa-1111\nbbbb-2222',
      );

      const done = harness.query('[data-testid="mfa-done"]');
      expect(done?.hasAttribute('disabled')).toBe(true);
      await harness.click('[data-testid="mfa-codes-saved"]');
      expect(
        harness.query('[data-testid="mfa-done"]')?.hasAttribute('disabled'),
      ).toBe(false);

      await harness.click('[data-testid="mfa-done"]');
      expect(onCompleted).toHaveBeenCalledTimes(1);
      expect(onCompleted.mock.calls[0][0].authentication?.token).toBe(
        'session',
      );
    });

    it('reports no session when the server returned none', async () => {
      mocks.startMfaEnrollment.mockResolvedValue({
        secret: 'S',
        otpauthUrl: 'otpauth://totp/x?secret=S',
      });
      mocks.confirmMfaEnrollment.mockResolvedValue({
        recoveryCodes: ['aaaa-1111'],
        authentication: null,
      });
      const onCompleted = vi.fn();
      await harness.render(<MfaEnrollmentFlow onCompleted={onCompleted} />);

      await harness.click('[data-testid="mfa-start"]');
      expect(mocks.startMfaEnrollment.mock.calls[0][0]).toEqual({
        challengeToken: undefined,
      });
      await enterCode('654321');
      await harness.click('[data-testid="mfa-codes-saved"]');
      await harness.click('[data-testid="mfa-done"]');

      expect(onCompleted).toHaveBeenCalledWith({ authentication: null });
    });

    it('keeps the person on the scan screen when the code is wrong', async () => {
      mocks.startMfaEnrollment.mockResolvedValue({
        secret: 'S',
        otpauthUrl: 'otpauth://totp/x?secret=S',
      });
      mocks.confirmMfaEnrollment.mockRejectedValue(
        serverError({ code: ErrorCode.INVALID_MFA_CODE, params: {} }),
      );
      await harness.render(<MfaEnrollmentFlow onCompleted={vi.fn()} />);

      await harness.click('[data-testid="mfa-start"]');
      await enterCode('000000');

      expect(harness.text()).toContain('not correct');
      expect(harness.query('[data-testid="mfa-recovery-codes"]')).toBeNull();
    });
  });

  describe('SignInForm', () => {
    async function submitCredentials() {
      await harness.type({ selector: '#email', value: 'dev@example.com' });
      await harness.type({ selector: '#password', value: 'secret-12345' });
      await harness.clickButton('Sign in');
    }

    it('hands an MFA challenge to the caller instead of showing an error', async () => {
      const onChallenge = vi.fn();
      mocks.signIn.mockRejectedValue(
        serverError({
          code: ErrorCode.MFA_REQUIRED,
          params: { challengeToken: 'challenge-1' },
        }),
      );
      await harness.render(<SignInForm onChallenge={onChallenge} />);

      await submitCredentials();

      expect(onChallenge).toHaveBeenCalledWith({
        kind: 'mfa',
        challengeToken: 'challenge-1',
      });
      expect(harness.text()).not.toContain('Something went wrong');
    });

    it('names a suspended organization', async () => {
      mocks.signIn.mockRejectedValue(
        serverError({ code: ErrorCode.TENANT_SUSPENDED, params: {} }),
      );
      await harness.render(<SignInForm onChallenge={vi.fn()} />);

      await submitCredentials();

      expect(harness.text()).toContain('suspended');
    });

    it('asks for the human check after the server requires one, then sends its token', async () => {
      mocks.captchaChallenge.mockResolvedValue({
        algorithm: 'SHA-256',
        challenge: 'c',
        salt: 's',
        maxNumber: 10,
        signature: 'sig',
      });
      mocks.solveInWorker.mockResolvedValue('solved-token');
      mocks.signIn
        .mockRejectedValueOnce(
          serverError({ code: ErrorCode.CAPTCHA_REQUIRED, params: {} }),
        )
        .mockResolvedValueOnce({ token: 't', projectId: 'p' });
      await harness.render(<SignInForm onChallenge={vi.fn()} />);

      await submitCredentials();
      expect(harness.query('[data-testid="pow-captcha"]')).not.toBeNull();
      await harness.flush();
      await harness.flush();
      await harness.clickButton('Sign in');

      expect(mocks.signIn).toHaveBeenCalledTimes(2);
      expect(mocks.signIn.mock.calls[1][0]).toEqual({
        email: 'dev@example.com',
        password: 'secret-12345',
        captchaToken: 'solved-token',
      });
    });
  });

  describe('PowCaptchaWidget', () => {
    it('fetches a challenge, solves it and hands over the token', async () => {
      const challenge = {
        algorithm: 'SHA-256',
        challenge: 'c',
        salt: 's',
        maxNumber: 10,
        signature: 'sig',
      };
      mocks.captchaChallenge.mockResolvedValue(challenge);
      mocks.solveInWorker.mockResolvedValue('token-1');
      const onToken = vi.fn();

      await harness.render(
        <PowCaptchaWidget
          onToken={onToken}
          onUnavailable={vi.fn()}
          resetSignal={0}
        />,
      );
      await harness.flush();
      await harness.flush();

      expect(mocks.solveInWorker).toHaveBeenCalledWith(challenge);
      expect(onToken).toHaveBeenLastCalledWith('token-1');
      expect(
        harness
          .query('[data-testid="pow-captcha"]')
          ?.getAttribute('data-status'),
      ).toBe('ready');
    });

    it('reports the check as unavailable when the challenge cannot be fetched', async () => {
      mocks.captchaChallenge.mockRejectedValue(new Error('offline'));
      const onUnavailable = vi.fn();

      await harness.render(
        <PowCaptchaWidget
          onToken={vi.fn()}
          onUnavailable={onUnavailable}
          resetSignal={0}
        />,
      );
      await harness.flush();
      await harness.flush();

      expect(onUnavailable).toHaveBeenCalled();
      expect(
        harness
          .query('[data-testid="pow-captcha"]')
          ?.getAttribute('data-status'),
      ).toBe('failed');
    });
  });

  describe('SsoLoginOptions', () => {
    it('renders one button per method and passes scope and tenant on', async () => {
      const providers: SsoProviderOption[] = [
        { provider: SsoProvider.FEISHU, label: '', scope: SsoScope.PLATFORM },
        { provider: SsoProvider.SAML, label: 'Okta', scope: SsoScope.TENANT },
      ];
      await harness.render(
        <SsoLoginOptions
          providers={providers}
          withDivider={false}
          tenant="acme"
        />,
      );

      const feishu = harness.query('[data-testid="sso-start-feishu"]');
      const saml = harness.query('[data-testid="sso-start-saml"]');
      const feishuUrl = new URL(feishu?.getAttribute('href') ?? '');
      expect(feishuUrl.searchParams.get('scope')).toBe('PLATFORM');
      expect(feishuUrl.searchParams.get('tenant')).toBe('acme');
      expect(saml?.textContent).toContain('Okta');
    });
  });

  describe('TenantDiscoveryPanel', () => {
    it('shows only tenants that have single sign-on, with their own buttons', async () => {
      await harness.render(
        <TenantDiscoveryPanel
          tenants={[
            tenantInfo({
              slug: 'acme',
              ssoProviders: [{ provider: 'OIDC', label: 'Acme ID' }],
            }),
            tenantInfo({ id: 'tenant-b', slug: 'plain', name: 'Plain Co' }),
          ]}
        />,
      );

      expect(
        harness.query('[data-testid="tenant-discovery-acme"]'),
      ).not.toBeNull();
      expect(
        harness.query('[data-testid="tenant-discovery-plain"]'),
      ).toBeNull();
      const button = harness.query('[data-testid="sso-start-oidc"]');
      expect(
        new URL(button?.getAttribute('href') ?? '').searchParams.get('tenant'),
      ).toBe('acme');
      expect(
        harness.queryAll('a').some((a) => a.getAttribute('href') === '/t/acme'),
      ).toBe(true);
    });

    it('renders nothing when no tenant offers single sign-on', async () => {
      await harness.render(
        <TenantDiscoveryPanel tenants={[tenantInfo({ slug: 'plain' })]} />,
      );
      expect(harness.query('[data-testid="tenant-discovery"]')).toBeNull();
    });
  });
});
