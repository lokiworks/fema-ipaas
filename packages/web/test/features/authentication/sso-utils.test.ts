import { SsoProvider, SsoScope } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { ssoUtils } from '@/features/authentication/utils/sso-utils';

describe('ssoUtils.startUrl', () => {
  it('carries provider, scope and tenant', () => {
    const url = new URL(
      ssoUtils.startUrl({
        provider: SsoProvider.WECOM,
        scope: SsoScope.PLATFORM,
        tenant: 'acme',
      }),
      'http://localhost',
    );
    expect(url.pathname).toBe('/api/v1/authn/sso/start');
    expect(url.searchParams.get('provider')).toBe('WECOM');
    expect(url.searchParams.get('scope')).toBe('PLATFORM');
    expect(url.searchParams.get('tenant')).toBe('acme');
  });

  it('leaves scope and tenant out when unknown', () => {
    const url = new URL(
      ssoUtils.startUrl({ provider: SsoProvider.OIDC, tenant: null }),
      'http://localhost',
    );
    expect(url.searchParams.get('provider')).toBe('OIDC');
    expect(url.searchParams.has('scope')).toBe(false);
    expect(url.searchParams.has('tenant')).toBe(false);
  });
});

describe('ssoUtils.providerLabel', () => {
  it('prefers the label the tenant configured', () => {
    expect(
      ssoUtils.providerLabel({
        provider: SsoProvider.OIDC,
        label: ' Acme ID ',
      }),
    ).toBe('Acme ID');
  });

  it('names each provider when no label is set', () => {
    const names = [
      SsoProvider.FEISHU,
      SsoProvider.WECOM,
      SsoProvider.DINGTALK,
      SsoProvider.SAML,
      SsoProvider.OIDC,
    ].map((provider) => ssoUtils.providerLabel({ provider, label: '' }));
    expect(names).toEqual([
      'Feishu',
      'WeCom',
      'DingTalk',
      'SAML',
      'Company account',
    ]);
  });

  it('marks platform apps as scan sign-in', () => {
    expect(
      ssoUtils.providerLabel({
        provider: SsoProvider.FEISHU,
        label: '',
        scope: SsoScope.PLATFORM,
      }),
    ).toBe('Feishu scan');
  });
});

describe('ssoUtils.fromPublicEntries', () => {
  it('keeps known providers as tenant-scoped options and drops unknown ones', () => {
    expect(
      ssoUtils.fromPublicEntries([
        { provider: 'SAML', label: 'Okta' },
        { provider: 'KERBEROS', label: 'Legacy' },
      ]),
    ).toEqual([{ provider: 'SAML', label: 'Okta', scope: 'TENANT' }]);
  });
});
