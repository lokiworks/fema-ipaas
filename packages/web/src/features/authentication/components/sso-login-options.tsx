import { SsoProvider, SsoProviderOption } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { KeyRound, MessageCircle, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { loginRedirect } from '@/lib/login-redirect';
import { FROM_QUERY_PARAM } from '@/lib/navigation-utils';

import { ssoUtils } from '../utils/sso-utils';

function SsoLoginOptions({ providers, withDivider }: SsoLoginOptionsProps) {
  if (providers.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-2" data-testid="sso-options">
      {providers.map((option) => (
        <Button
          key={option.provider}
          asChild
          variant="outline"
          className="h-10 w-full justify-center gap-2"
        >
          <a
            href={ssoUtils.startUrl(option.provider)}
            onClick={() =>
              loginRedirect.rememberForExternalSignIn(
                new URLSearchParams(window.location.search).get(
                  FROM_QUERY_PARAM,
                ),
              )
            }
            data-testid={`sso-start-${option.provider.toLowerCase()}`}
          >
            {providerIcon(option.provider)}
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
      <span>{ssoUtils.errorMessage(code)}</span>
    </div>
  );
}

function providerIcon(provider: SsoProvider) {
  return provider === SsoProvider.FEISHU ? (
    <MessageCircle className="size-4" />
  ) : (
    <KeyRound className="size-4" />
  );
}

export { SsoLoginOptions, SsoErrorNote };

type SsoLoginOptionsProps = {
  providers: SsoProviderOption[];
  withDivider: boolean;
};
