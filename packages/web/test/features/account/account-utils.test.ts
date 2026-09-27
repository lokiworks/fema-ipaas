import { DEFAULT_NOTIFICATION_PREFERENCES } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { accountUtils } from '@/features/account/utils/account-utils';

describe('accountUtils', () => {
  it('changes one channel of one event without touching the rest', () => {
    const next = accountUtils.setPreference({
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      event: 'weeklyDigest',
      channel: 'email',
      value: true,
    });
    expect(next.weeklyDigest).toEqual({ im: false, email: true });
    expect(next.runFailed).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.runFailed);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.weeklyDigest.email).toBe(false);
  });

  it('joins names and tolerates an empty last name', () => {
    expect(accountUtils.displayName({ firstName: '李雷', lastName: '' })).toBe(
      '李雷',
    );
    expect(
      accountUtils.displayName({ firstName: 'Ada', lastName: 'Lovelace' }),
    ).toBe('Ada Lovelace');
  });

  it('detects expired tokens', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    expect(accountUtils.isExpired({ expiresAt: null, now })).toBe(false);
    expect(
      accountUtils.isExpired({ expiresAt: '2026-05-01T00:00:00.000Z', now }),
    ).toBe(true);
    expect(
      accountUtils.isExpired({ expiresAt: '2026-07-01T00:00:00.000Z', now }),
    ).toBe(false);
  });
});
