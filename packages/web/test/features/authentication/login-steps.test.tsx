/**
 * @vitest-environment jsdom
 */
import { ErrorCode } from '@fema-ipaas/core-utils';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MfaChallengeStep } from '@/features/authentication/components/mfa-challenge-step';
import { SmsLoginStep } from '@/features/authentication/components/sms-login-step';
import { TenantSelectionStep } from '@/features/authentication/components/tenant-selection-step';

import { renderHarness } from './render-harness';

const mocks = vi.hoisted(() => ({
  verifyMfa: vi.fn(),
  requestSmsCode: vi.fn(),
  verifySmsCode: vi.fn(),
  tenantSelectionOptions: vi.fn(),
  selectTenant: vi.fn(),
  saveResponse: vi.fn(),
  redirect: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/api/authentication-api', () => ({
  authenticationApi: {
    verifyMfa: mocks.verifyMfa,
    requestSmsCode: mocks.requestSmsCode,
    verifySmsCode: mocks.verifySmsCode,
    tenantSelectionOptions: mocks.tenantSelectionOptions,
    selectTenant: mocks.selectTenant,
  },
}));

vi.mock('@/lib/authentication-session', () => ({
  authenticationSession: { saveResponse: mocks.saveResponse },
}));

vi.mock('@/lib/navigation-utils', () => ({
  useRedirectAfterLogin: () => mocks.redirect,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

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

const harness = renderHarness.createHarness();

describe('login steps', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    harness.mount();
  });

  afterEach(async () => {
    await harness.unmount();
  });

  describe('MfaChallengeStep', () => {
    it('sends a recovery code with the challenge token and finishes the sign-in', async () => {
      mocks.verifyMfa.mockResolvedValue({ token: 't', projectId: 'p' });
      await harness.render(
        <MfaChallengeStep
          challengeToken="challenge-1"
          onBack={vi.fn()}
          onChallenge={vi.fn()}
        />,
      );

      await harness.click('[data-testid="mfa-toggle-mode"]');
      await harness.type({
        selector: '[data-testid="mfa-recovery-input"]',
        value: 'abcd-efgh-ijkl',
      });
      await harness.click('[data-testid="mfa-recovery-submit"]');

      expect(mocks.verifyMfa).toHaveBeenCalledTimes(1);
      expect(mocks.verifyMfa.mock.calls[0][0]).toEqual({
        challengeToken: 'challenge-1',
        code: 'abcd-efgh-ijkl',
      });
      expect(mocks.saveResponse).toHaveBeenCalled();
      expect(mocks.redirect).toHaveBeenCalled();
    });

    it('says the code is wrong when the server refuses it', async () => {
      mocks.verifyMfa.mockRejectedValue(
        serverError({ code: ErrorCode.INVALID_MFA_CODE, params: {} }),
      );
      await harness.render(
        <MfaChallengeStep
          challengeToken="challenge-1"
          onBack={vi.fn()}
          onChallenge={vi.fn()}
        />,
      );

      await harness.click('[data-testid="mfa-toggle-mode"]');
      await harness.type({
        selector: '[data-testid="mfa-recovery-input"]',
        value: 'wrong-code',
      });
      await harness.click('[data-testid="mfa-recovery-submit"]');

      expect(harness.text()).toContain('not correct');
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it('hands a follow-up tenant choice to the caller', async () => {
      const onChallenge = vi.fn();
      mocks.verifyMfa.mockRejectedValue(
        serverError({
          code: ErrorCode.TENANT_SELECTION_REQUIRED,
          params: { selectionToken: 'sel-1' },
        }),
      );
      await harness.render(
        <MfaChallengeStep
          challengeToken="challenge-1"
          onBack={vi.fn()}
          onChallenge={onChallenge}
        />,
      );

      await harness.click('[data-testid="mfa-toggle-mode"]');
      await harness.type({
        selector: '[data-testid="mfa-recovery-input"]',
        value: 'recovery-1',
      });
      await harness.click('[data-testid="mfa-recovery-submit"]');

      expect(onChallenge).toHaveBeenCalledWith({
        kind: 'tenant-selection',
        selectionToken: 'sel-1',
      });
    });
  });

  describe('TenantSelectionStep', () => {
    it('lists the tenants and exchanges the chosen one for a session', async () => {
      mocks.tenantSelectionOptions.mockResolvedValue({
        tenants: [
          {
            tenantId: 'tenant-a',
            slug: 'acme',
            name: 'Acme Ltd',
            logoIconUrl: '',
            role: 'ADMIN',
            status: 'ACTIVE',
          },
          {
            tenantId: 'tenant-b',
            slug: 'globex',
            name: 'Globex',
            logoIconUrl: '',
            role: 'MEMBER',
            status: 'SUSPENDED',
          },
        ],
      });
      mocks.selectTenant.mockResolvedValue({ token: 't', projectId: 'p' });
      await harness.render(
        <TenantSelectionStep
          selectionToken="sel-1"
          onBack={vi.fn()}
          onChallenge={vi.fn()}
        />,
      );
      await harness.flush();

      expect(harness.text()).toContain('Acme Ltd');
      expect(harness.text()).toContain('Globex');
      const suspended = harness.query('[data-testid="tenant-option-globex"]');
      expect(suspended?.hasAttribute('disabled')).toBe(true);

      await harness.click('[data-testid="tenant-option-acme"]');

      expect(mocks.selectTenant.mock.calls[0][0]).toEqual({
        selectionToken: 'sel-1',
        tenantId: 'tenant-a',
      });
      expect(mocks.saveResponse).toHaveBeenCalled();
    });

    it('tells the person when the tenant was suspended in the meantime', async () => {
      mocks.tenantSelectionOptions.mockResolvedValue({
        tenants: [
          {
            tenantId: 'tenant-a',
            slug: 'acme',
            name: 'Acme Ltd',
            logoIconUrl: '',
            role: 'ADMIN',
            status: 'ACTIVE',
          },
        ],
      });
      mocks.selectTenant.mockRejectedValue(
        serverError({ code: ErrorCode.TENANT_SUSPENDED, params: {} }),
      );
      await harness.render(
        <TenantSelectionStep
          selectionToken="sel-1"
          onBack={vi.fn()}
          onChallenge={vi.fn()}
        />,
      );
      await harness.flush();

      await harness.click('[data-testid="tenant-option-acme"]');

      expect(harness.text()).toContain('suspended');
    });
  });

  describe('SmsLoginStep', () => {
    function renderSms(overrides: { captchaToken?: string } = {}) {
      return harness.render(
        <SmsLoginStep
          captchaToken={overrides.captchaToken}
          captchaRequired
          onCaptchaSpent={vi.fn()}
          onBack={vi.fn()}
          onNeedsName={vi.fn()}
          onChallenge={vi.fn()}
        />,
      );
    }

    it('waits for the human check before it lets a code be requested', async () => {
      await renderSms();
      await harness.type({
        selector: '[data-testid="sms-phone"]',
        value: '13812345678',
      });

      const send = harness.query('[data-testid="sms-send"]');
      expect(send?.hasAttribute('disabled')).toBe(true);
    });

    it('sends the code to the number with the default +86 prefix', async () => {
      mocks.requestSmsCode.mockResolvedValue(undefined);
      await renderSms({ captchaToken: 'pow-token' });
      await harness.type({
        selector: '[data-testid="sms-phone"]',
        value: '138 1234 5678',
      });

      await harness.click('[data-testid="sms-send"]');

      expect(mocks.requestSmsCode.mock.calls[0][0]).toEqual({
        phone: '+8613812345678',
        captchaToken: 'pow-token',
      });
      expect(harness.text()).toContain('+86138****5678');
      expect(harness.query('[data-testid="sms-code"]')).not.toBeNull();
    });

    it('rejects a number that cannot be valid before calling the server', async () => {
      await renderSms({ captchaToken: 'pow-token' });
      await harness.type({
        selector: '[data-testid="sms-phone"]',
        value: '12',
      });

      await harness.click('[data-testid="sms-send"]');

      expect(mocks.requestSmsCode).not.toHaveBeenCalled();
      expect(harness.text()).toContain('valid phone number');
    });

    it('says so when text messages are not set up', async () => {
      mocks.requestSmsCode.mockRejectedValue(
        serverError({ code: ErrorCode.SMS_NOT_CONFIGURED, params: {} }),
      );
      await renderSms({ captchaToken: 'pow-token' });
      await harness.type({
        selector: '[data-testid="sms-phone"]',
        value: '13812345678',
      });

      await harness.click('[data-testid="sms-send"]');

      expect(harness.text()).toContain('not available');
    });
  });
});
