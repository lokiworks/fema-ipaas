import { describe, expect, it } from 'vitest';

import { ssoFormUtils } from './sso-form-utils';

describe('ssoFormUtils extra authorization parameters', () => {
  it('round-trips rows and parameters', () => {
    const rows = ssoFormUtils.paramsToRows({
      organization: 'acme',
      tenant: 't1',
    });
    expect(rows).toEqual([
      { key: 'organization', value: 'acme' },
      { key: 'tenant', value: 't1' },
    ]);
    expect(ssoFormUtils.rowsToParams(rows)).toEqual({
      organization: 'acme',
      tenant: 't1',
    });
  });

  it('drops rows without a name and trims names', () => {
    expect(
      ssoFormUtils.rowsToParams([
        { key: ' org ', value: 'a' },
        { key: '  ', value: 'ignored' },
      ]),
    ).toEqual({ org: 'a' });
  });
});

describe('ssoFormUtils re-check interval', () => {
  it('treats empty as off', () => {
    expect(ssoFormUtils.parseRecheck(' ')).toBeNull();
    expect(ssoFormUtils.recheckError('')).toBeNull();
  });

  it('accepts 5 to 1440 only', () => {
    expect(ssoFormUtils.parseRecheck('15')).toBe(15);
    expect(ssoFormUtils.recheckError('15')).toBeNull();
    expect(ssoFormUtils.recheckError('4')).toBe('ssoRecheckRange');
    expect(ssoFormUtils.recheckError('1441')).toBe('ssoRecheckRange');
    expect(ssoFormUtils.recheckError('abc')).toBe('ssoRecheckRange');
  });
});
