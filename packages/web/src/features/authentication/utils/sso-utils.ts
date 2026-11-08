import {
  PublicSsoEntry,
  SsoLoginErrorCode,
  SsoProvider,
  SsoProviderOption,
  SsoScope,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { API_URL } from '@/lib/api';

function errorMessage({
  code,
  websiteName,
}: {
  code: string;
  websiteName: string;
}): string {
  switch (code) {
    case SsoLoginErrorCode.PROVIDER_NOT_ENABLED:
      return t('This sign-in method is not turned on.');
    case SsoLoginErrorCode.STATE_INVALID:
      return t(
        'The sign-in request is invalid or has expired. Start again from this page.',
      );
    case SsoLoginErrorCode.STATE_REPLAYED:
      return t('This sign-in was already used. Start again from this page.');
    case SsoLoginErrorCode.BROWSER_MISMATCH:
      return t(
        'The sign-in finished in a different browser than the one it started in. Start again in a single browser.',
      );
    case SsoLoginErrorCode.IDP_DENIED:
      return t(
        'The sign-in was cancelled or refused at your company account provider.',
      );
    case SsoLoginErrorCode.CLIENT_REJECTED:
      return t(
        'The identity provider rejected this application. Ask an administrator to check the client ID and secret.',
      );
    case SsoLoginErrorCode.CODE_REJECTED:
      return t(
        'The identity provider no longer accepts this sign-in. Start again.',
      );
    case SsoLoginErrorCode.TOKEN_INVALID:
      return t(
        'The identity returned by the provider could not be verified, so nobody was signed in.',
      );
    case SsoLoginErrorCode.ISSUER_MISMATCH:
      return t(
        'The issuer of the identity provider does not match the configuration. Ask an administrator to check it.',
      );
    case SsoLoginErrorCode.EMAIL_MISSING:
      return t(
        'Your company account has no email address, or this application is not allowed to read it.',
      );
    case SsoLoginErrorCode.EMAIL_NOT_VERIFIED:
      return t(
        'The email of your company account is not verified, so it cannot be used to sign in.',
      );
    case SsoLoginErrorCode.DOMAIN_NOT_ALLOWED:
      return t(
        'The email domain of your company account is not allowed to sign in here.',
      );
    case SsoLoginErrorCode.USER_NOT_PROVISIONED:
      return t('ssoUserNotProvisioned', { websiteName });
    case SsoLoginErrorCode.USER_DISABLED:
      return t('Your account has been disabled. Contact an administrator.');
    case SsoLoginErrorCode.ENTERPRISE_MISMATCH:
      return t(
        'This account belongs to a different company than the one allowed here.',
      );
    case SsoLoginErrorCode.PROVIDER_UNREACHABLE:
      return t(
        'The identity provider could not be reached. Try again later or contact an administrator.',
      );
    case SsoLoginErrorCode.TEST_ACCOUNT_MISMATCH:
      return t(
        'The test sign-in used a different account than yours. Sign in at the identity provider with your own account.',
      );
    case SsoLoginErrorCode.TICKET_INVALID:
      return t('The sign-in has expired. Start again.');
    default:
      return t(
        'Signing in with the company account failed. Try again or contact an administrator.',
      );
  }
}

function providerLabel({
  provider,
  label,
  scope,
}: {
  provider: SsoProvider;
  label: string;
  scope?: SsoScope;
}): string {
  if (label.trim().length > 0) {
    return label.trim();
  }
  const name = providerName(provider);
  return scope === SsoScope.PLATFORM ? t('{name} scan', { name }) : name;
}

function providerName(provider: SsoProvider): string {
  switch (provider) {
    case SsoProvider.FEISHU:
      return t('Feishu');
    case SsoProvider.WECOM:
      return t('WeCom');
    case SsoProvider.DINGTALK:
      return t('DingTalk');
    case SsoProvider.SAML:
      return t('SAML');
    default:
      return t('Company account');
  }
}

function startUrl({
  provider,
  scope,
  tenant,
}: {
  provider: SsoProvider;
  scope?: SsoScope;
  tenant?: string | null;
}): string {
  const query = new URLSearchParams({ provider });
  if (scope !== undefined) {
    query.set('scope', scope);
  }
  if (tenant !== undefined && tenant !== null && tenant.length > 0) {
    query.set('tenant', tenant);
  }
  return `${API_URL}/v1/authn/sso/start?${query.toString()}`;
}

function isSsoProvider(value: string): value is SsoProvider {
  return Object.values<string>(SsoProvider).includes(value);
}

function fromPublicEntries(entries: PublicSsoEntry[]): SsoProviderOption[] {
  return entries.flatMap((entry) =>
    isSsoProvider(entry.provider)
      ? [
          {
            provider: entry.provider,
            label: entry.label,
            scope: SsoScope.TENANT,
          },
        ]
      : [],
  );
}

export const ssoUtils = {
  fromPublicEntries,
  errorMessage,
  providerLabel,
  providerName,
  startUrl,
};
