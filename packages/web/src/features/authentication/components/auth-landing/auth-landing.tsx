import { isNil } from '@fema-ipaas/core-utils';
import { FlagId } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useEffect } from 'react';

import { useTheme } from '@/components/providers/theme-provider';
import { InstallChecksPanel } from '@/features/system';
import { flagsHooks } from '@/hooks/flags-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { useRedirectAfterLogin } from '@/lib/navigation-utils';

import { AuthDrawerBody, AuthMode } from './auth-drawer-body';

export function AuthLanding({ initialMode }: AuthLandingProps) {
  const { setForceLightMode } = useTheme();
  const redirectAfterLogin = useRedirectAfterLogin();
  const signedIn =
    !isNil(authenticationSession.getToken()) &&
    !authenticationSession.isOnboarding();
  const { data: userCreated } = flagsHooks.useFlag<boolean>(
    FlagId.USER_CREATED,
  );
  const firstUser = userCreated !== true;

  useEffect(() => {
    setForceLightMode(true);
    return () => setForceLightMode(false);
  }, [setForceLightMode]);

  useEffect(() => {
    if (signedIn) {
      redirectAfterLogin();
    }
  }, [signedIn, redirectAfterLogin]);

  if (signedIn) {
    return null;
  }

  return (
    <div className="grid min-h-dvh w-full grid-cols-1 bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <BrandPanel />
      <main className="flex flex-col items-center justify-center gap-4 overflow-y-auto p-4 lg:flex-row lg:items-start lg:justify-start lg:p-16">
        <section
          role="dialog"
          aria-label={t('Sign in or create your account')}
          className="w-full max-w-[400px] overflow-hidden rounded-2xl border bg-background shadow-sm"
        >
          <AuthDrawerBody initialMode={initialMode} />
        </section>
        {firstUser && (
          <section className="max-h-[90dvh] w-full max-w-[400px] overflow-y-auto rounded-2xl border bg-background">
            <InstallChecksPanel />
          </section>
        )}
      </main>
    </div>
  );
}

function BrandPanel() {
  const branding = flagsHooks.useWebsiteBranding();
  const welcomeText = branding.welcomeText?.trim() ?? '';
  return (
    <aside className="hidden flex-col justify-between gap-8 border-r bg-sidebar p-12 lg:flex">
      <div className="flex items-center gap-3">
        <img
          src={branding.logos.logoIconUrl}
          alt=""
          className="size-9 rounded-md object-contain"
        />
        <span className="text-lg font-semibold">{branding.websiteName}</span>
      </div>
      <div className="flex flex-col gap-3">
        {welcomeText.length > 0 && (
          <p className="max-w-md text-3xl font-semibold leading-snug text-foreground">
            {welcomeText}
          </p>
        )}
        <p className="max-w-md text-sm text-muted-foreground">
          {t(
            'Connect your systems, automate the work between them, and keep every run under control.',
          )}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">
        {branding.websiteName}
      </span>
    </aside>
  );
}

type AuthLandingProps = {
  initialMode: AuthMode;
};
