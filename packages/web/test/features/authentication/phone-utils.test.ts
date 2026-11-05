import { describe, expect, it } from 'vitest';

import { phoneUtils } from '@/features/authentication/utils/phone-utils';

describe('phoneUtils', () => {
  it('defaults to the +86 country code', () => {
    expect(phoneUtils.DEFAULT_COUNTRY_CODE).toBe('+86');
  });

  it('joins the country code and strips separators', () => {
    expect(
      phoneUtils.normalize({
        countryCode: '+86',
        nationalNumber: '138 1234-5678',
      }),
    ).toBe('+8613812345678');
  });

  it('drops a leading trunk zero outside China', () => {
    expect(
      phoneUtils.normalize({
        countryCode: '+44',
        nationalNumber: '07911 123456',
      }),
    ).toBe('+447911123456');
  });

  it('keeps a number that already carries its own country code', () => {
    expect(
      phoneUtils.normalize({
        countryCode: '+86',
        nationalNumber: '+852 6123 4567',
      }),
    ).toBe('+85261234567');
  });

  it('validates the E.164 shape', () => {
    expect(phoneUtils.isValid('+8613812345678')).toBe(true);
    expect(phoneUtils.isValid('13812345678')).toBe(false);
    expect(phoneUtils.isValid('+86')).toBe(false);
  });

  it('masks the middle digits', () => {
    expect(phoneUtils.mask('+8613812345678')).toBe('+86138****5678');
  });
});
