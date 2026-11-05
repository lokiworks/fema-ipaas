import { ErrorCode } from '@fema-ipaas/core-utils';
import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { captchaUtils } from '@/features/authentication/utils/captcha-utils';

function errorWith(data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('failed', undefined, config, undefined, {
    status: 400,
    statusText: '',
    headers: {},
    config,
    data,
  });
}

describe('captchaUtils', () => {
  it('recognises a rejected token', () => {
    const error = errorWith({
      code: ErrorCode.VALIDATION,
      params: { message: 'captchaVerificationFailed' },
    });
    expect(captchaUtils.isRejection(error)).toBe(true);
    expect(captchaUtils.needsFreshToken(error)).toBe(true);
  });

  it('recognises a missing token', () => {
    const error = errorWith({ code: ErrorCode.CAPTCHA_REQUIRED, params: {} });
    expect(captchaUtils.isRequired(error)).toBe(true);
    expect(captchaUtils.needsFreshToken(error)).toBe(true);
  });

  it('ignores unrelated errors', () => {
    const error = errorWith({
      code: ErrorCode.INVALID_CREDENTIALS,
      params: {},
    });
    expect(captchaUtils.needsFreshToken(error)).toBe(false);
  });

  it('uses Turnstile only when it is selected and has a site key', () => {
    expect(
      captchaUtils.resolveMode({
        provider: 'TURNSTILE',
        turnstileSiteKey: 'k',
      }),
    ).toBe('TURNSTILE');
    expect(
      captchaUtils.resolveMode({
        provider: 'TURNSTILE',
        turnstileSiteKey: null,
      }),
    ).toBe('BUILTIN');
    expect(
      captchaUtils.resolveMode({ provider: 'BUILTIN', turnstileSiteKey: 'k' }),
    ).toBe('BUILTIN');
    expect(
      captchaUtils.resolveMode({ provider: null, turnstileSiteKey: 'k' }),
    ).toBe('BUILTIN');
  });
});
