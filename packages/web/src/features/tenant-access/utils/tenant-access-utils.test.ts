import { describe, expect, it } from 'vitest';

import { tenantAccessUtils } from './tenant-access-utils';

describe('tenantAccessUtils.normalizePhone', () => {
  it('adds +86 to mainland numbers and strips separators', () => {
    expect(tenantAccessUtils.normalizePhone('138-0013-8000')).toBe(
      '+8613800138000',
    );
    expect(tenantAccessUtils.normalizePhone('8613800138000')).toBe(
      '+8613800138000',
    );
  });

  it('keeps international numbers', () => {
    expect(tenantAccessUtils.normalizePhone('+1 415 555 0100')).toBe(
      '+14155550100',
    );
  });
});

describe('tenantAccessUtils.parseContacts', () => {
  it('splits emails, phones and invalid entries', () => {
    expect(
      tenantAccessUtils.parseContacts(
        'A@x.com, 13800138000\n+14155550100；bad value;a@x.com',
      ),
    ).toEqual({
      emails: ['a@x.com'],
      phones: ['+8613800138000', '+14155550100'],
      invalid: ['bad value'],
    });
  });
});

describe('tenantAccessUtils.slugError', () => {
  it('accepts lowercase letters, digits and inner hyphens', () => {
    expect(tenantAccessUtils.slugError('acme-1')).toBeNull();
  });

  it('rejects short, long and malformed slugs', () => {
    expect(tenantAccessUtils.slugError('ab')).not.toBeNull();
    expect(tenantAccessUtils.slugError('-acme')).not.toBeNull();
    expect(tenantAccessUtils.slugError('a'.repeat(41))).not.toBeNull();
    expect(tenantAccessUtils.slugError('Acme Corp')).not.toBeNull();
  });
});

describe('tenantAccessUtils.tenantLoginUrl', () => {
  it('joins origin and slug without a doubled slash', () => {
    expect(
      tenantAccessUtils.tenantLoginUrl({
        origin: 'https://ipaas.example.com/',
        slug: 'acme',
      }),
    ).toBe('https://ipaas.example.com/t/acme');
  });
});
