import { ErrorCode } from '@fema-ipaas/core-utils';
import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { loginChallengeUtils } from '@/features/authentication/utils/login-challenge-utils';

function errorWith(data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('failed', undefined, config, undefined, {
    status: 409,
    statusText: '',
    headers: {},
    config,
    data,
  });
}

describe('loginChallengeUtils.parse', () => {
  it('reads an MFA challenge', () => {
    const error = errorWith({
      code: ErrorCode.MFA_REQUIRED,
      params: { challengeToken: 'tok' },
    });
    expect(loginChallengeUtils.parse(error)).toEqual({
      kind: 'mfa',
      challengeToken: 'tok',
    });
  });

  it('reads a forced enrollment challenge', () => {
    const error = errorWith({
      code: ErrorCode.MFA_ENROLLMENT_REQUIRED,
      params: { challengeToken: 'enroll' },
    });
    expect(loginChallengeUtils.parse(error)).toEqual({
      kind: 'mfa-enrollment',
      challengeToken: 'enroll',
    });
  });

  it('reads a tenant selection challenge', () => {
    const error = errorWith({
      code: ErrorCode.TENANT_SELECTION_REQUIRED,
      params: { selectionToken: 'sel' },
    });
    expect(loginChallengeUtils.parse(error)).toEqual({
      kind: 'tenant-selection',
      selectionToken: 'sel',
    });
  });

  it('returns null without the token or for other errors', () => {
    expect(
      loginChallengeUtils.parse(
        errorWith({ code: ErrorCode.MFA_REQUIRED, params: {} }),
      ),
    ).toBeNull();
    expect(
      loginChallengeUtils.parse(
        errorWith({ code: ErrorCode.INVALID_CREDENTIALS, params: {} }),
      ),
    ).toBeNull();
    expect(loginChallengeUtils.parse(new Error('boom'))).toBeNull();
  });
});

describe('loginChallengeUtils.messageFor', () => {
  it('explains a suspended tenant', () => {
    const message = loginChallengeUtils.messageFor(
      errorWith({ code: ErrorCode.TENANT_SUSPENDED, params: {} }),
    );
    expect(message).toContain('suspended');
  });

  it('has nothing to say about unknown errors', () => {
    expect(
      loginChallengeUtils.messageFor(
        errorWith({ code: ErrorCode.VALIDATION, params: {} }),
      ),
    ).toBeNull();
  });
});
