import { SsoProvider, SsoProviderOption, SsoScope } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  KeyRound,
  MessageCircle,
  QrCode,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { flagsHooks } from '@/hooks/flags-hooks';
import { loginRedirect } from '@/lib/login-redirect';
import { FROM_QUERY_PARAM } from '@/lib/navigation-utils';
import { tenantContext } from '@/lib/tenant-context';

import { ssoUtils } from '../utils/sso-utils';

function SsoLoginOptions({
  providers,
  withDivider,
  tenant,
}: SsoLoginOptionsProps) {
  if (providers.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-2" data-testid="sso-options">
      {providers.map((option) => (
        <Button
          key={`${option.scope}-${option.provider}`}
          asChild
          variant="outline"
          className="h-10 w-full justify-center gap-2"
        >
          <a
            href={ssoUtils.startUrl({
              provider: option.provider,
              scope: option.scope,
              tenant: tenant === undefined ? tenantContext.get() : tenant,
            })}
            onClick={() =>
              loginRedirect.rememberForExternalSignIn(
                new URLSearchParams(window.location.search).get(
                  FROM_QUERY_PARAM,
                ),
              )
            }
            data-testid={`sso-start-${option.provider.toLowerCase()}`}
            data-scope={option.scope.toLowerCase()}
          >
            {providerIcon(option)}
            {t('Sign in with {name}', {
              name: ssoUtils.providerLabel(option),
            })}
          </a>
        </Button>
      ))}
      {withDivider && (
        <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {t('or')}
          <span className="h-px flex-1 bg-border" />
        </div>
      )}
    </div>
  );
}

function SsoErrorNote() {
  const branding = flagsHooks.useWebsiteBranding();
  const [code] = useState(() =>
    new URLSearchParams(window.location.search).get('ssoError'),
  );
  useEffect(() => {
    if (code === null) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('ssoError');
    window.history.replaceState(null, '', url.toString());
  }, [code]);
  if (code === null) {
    return null;
  }
  return (
    <div
      role="alert"
      data-testid="sso-error"
      data-code={code}
      className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>
        {ssoUtils.errorMessage({ code, websiteName: branding.websiteName })}
      </span>
    </div>
  );
}

function providerIcon({ provider, scope }: SsoProviderOption) {
  if (scope === SsoScope.PLATFORM) {
    return <QrCode className="size-4" />;
  }
  switch (provider) {
    case SsoProvider.FEISHU:
    case SsoProvider.WECOM:
    case SsoProvider.DINGTALK:
      return <MessageCircle className="size-4" />;
    case SsoProvider.SAML:
      return <ShieldCheck className="size-4" />;
    default:
      return <KeyRound className="size-4" />;
  }
}

export { SsoLoginOptions, SsoErrorNote };

type SsoLoginOptionsProps = {
  providers: SsoProviderOption[];
  withDivider: boolean;
  tenant?: string | null;
};
