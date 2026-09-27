import { describe, expect, it } from 'vitest';

import { dataStoreUtils } from '@/features/data-stores/utils/data-store-utils';

describe('dataStoreUtils.expiryStatus', () => {
  const now = new Date('2026-09-27T08:00:00.000Z');

  it('marks records at or past their expiry as expired', () => {
    expect(
      dataStoreUtils.expiryStatus({
        expiresAt: '2026-09-27T08:00:00.000Z',
        now,
      }),
    ).toBe('expired');
    expect(
      dataStoreUtils.expiryStatus({
        expiresAt: '2026-09-20T08:00:00.000Z',
        now,
      }),
    ).toBe('expired');
  });

  it('highlights records that expire within two days', () => {
    expect(
      dataStoreUtils.expiryStatus({
        expiresAt: '2026-09-27T08:00:01.000Z',
        now,
      }),
    ).toBe('expiringSoon');
    expect(
      dataStoreUtils.expiryStatus({
        expiresAt: '2026-09-29T08:00:00.000Z',
        now,
      }),
    ).toBe('expiringSoon');
  });

  it('treats later expiries as normal and missing expiry as none', () => {
    expect(
      dataStoreUtils.expiryStatus({
        expiresAt: '2026-09-29T08:00:01.000Z',
        now,
      }),
    ).toBe('normal');
    expect(dataStoreUtils.expiryStatus({ expiresAt: null, now })).toBe('none');
  });
});

describe('dataStoreUtils.displayValue', () => {
  it('shows strings as typed and other values as JSON', () => {
    expect(dataStoreUtils.displayValue('{"a":1}')).toBe('{"a":1}');
    expect(dataStoreUtils.displayValue(['a', 1])).toBe('["a",1]');
    expect(dataStoreUtils.displayValue(null)).toBe('null');
    expect(dataStoreUtils.displayValue(undefined)).toBe('');
  });
});
