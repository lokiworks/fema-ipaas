import { readFileSync } from 'fs';
import path from 'path';

import { ApplicationEvent, ApplicationEventName } from '@fema-ipaas/shared';
import i18n from 'i18next';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { auditEventUtils } from '@/features/audit-events/utils/audit-event-utils';

function signInFailed(detail: string | undefined): ApplicationEvent {
  return {
    id: 'e1',
    tenantId: 't1',
    created: '2025-06-15T12:00:00Z',
    updated: '2025-06-15T12:00:00Z',
    action: ApplicationEventName.USER_SIGN_IN_FAILED,
    ip: '127.0.0.1',
    data: { target: 'a@corp.test', detail },
  };
}

describe('auditEventUtils.summarize for failed sign-ins', () => {
  beforeAll(async () => {
    const zh = JSON.parse(
      readFileSync(
        path.resolve(__dirname, '../../../public/locales/zh/translation.json'),
        'utf-8',
      ),
    );
    i18n.addResourceBundle('zh', 'translation', zh, true, true);
    await i18n.changeLanguage('zh');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('writes password failures in plain Chinese', () => {
    expect(
      auditEventUtils.summarize({
        event: signInFailed('password: INVALID_CREDENTIALS'),
      }),
    ).toBe('邮箱 a@corp.test 使用密码登录失败：邮箱或密码错误');
  });

  it('names the verification code method', () => {
    expect(
      auditEventUtils.summarize({
        event: signInFailed('email code: INVALID_OTP'),
      }),
    ).toBe('邮箱 a@corp.test 使用邮箱验证码登录失败：验证码错误或已过期');
  });

  it('falls back to a generic reason for unknown codes', () => {
    expect(
      auditEventUtils.summarize({
        event: signInFailed('password: SOMETHING_ELSE'),
      }),
    ).toBe('邮箱 a@corp.test 使用密码登录失败：登录被拒绝');
  });

  it('keeps single sign-on details as they were recorded', () => {
    expect(
      auditEventUtils.summarize({
        event: signInFailed('OIDC: STATE_MISMATCH - expired'),
      }),
    ).toBe('a@corp.test · OIDC: STATE_MISMATCH - expired');
  });
});
