import { isNil } from '@fema-ipaas/core-utils';
import { FlagId } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { FullLogo } from '@/components/custom/full-logo';
import { SetupWizard } from '@/features/setup-wizard';
import { flagsHooks } from '@/hooks/flags-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { useRedirectAfterLogin } from '@/lib/navigation-utils';

import { AuthDrawerBody, AuthMode } from './auth-drawer-body';
import { AuthThemeSwitch } from './auth-theme-switch';

export function AuthLanding({ initialMode }: AuthLandingProps) {
  const redirectAfterLogin = useRedirectAfterLogin();
  const signedIn =
    !isNil(authenticationSession.getToken()) &&
    !authenticationSession.isOnboarding();
  const { data: userCreated } = flagsHooks.useFlag<boolean>(
    FlagId.USER_CREATED,
  );
  const location = useLocation();
  const [showWizard] = useState(
    () => userCreated !== true && !authenticationSession.isOnboarding(),
  );

  useEffect(() => {
    if (signedIn) {
      redirectAfterLogin();
    }
  }, [signedIn, redirectAfterLogin]);

  if (signedIn) {
    return null;
  }

  if (showWizard && location.pathname !== SETUP_PATH) {
    return <Navigate to={`${SETUP_PATH}${location.search}`} replace />;
  }

  if (!showWizard && location.pathname === SETUP_PATH) {
    return <Navigate to={`/sign-in${location.search}`} replace />;
  }

  return (
    <AuthSplitLayout>
      {showWizard ? (
        <section
          aria-label={t('Setup wizard')}
          className="w-full max-w-[680px]"
        >
          <SetupWizard />
        </section>
      ) : (
        <section
          role="dialog"
          aria-label={t('Sign in or create your account')}
          className="w-full max-w-[400px] overflow-hidden rounded-2xl border bg-background shadow-sm"
        >
          <AuthDrawerBody initialMode={initialMode} />
        </section>
      )}
    </AuthSplitLayout>
  );
}

export function AuthSplitLayout({
  children,
  showMobileBrand = false,
}: {
  children: React.ReactNode;
  showMobileBrand?: boolean;
}) {
  return (
    <div className="relative grid min-h-dvh w-full grid-cols-1 bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="absolute right-4 top-4 z-10">
        <AuthThemeSwitch />
      </div>
      <BrandPanel />
      <main className="flex flex-col items-center justify-center gap-4 overflow-y-auto p-4 lg:p-16">
        {showMobileBrand && (
          <div className="lg:hidden">
            <FullLogo className="h-7" />
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

function BrandPanel() {
  const branding = flagsHooks.useWebsiteBranding();
  return (
    <aside className="hidden flex-col justify-between gap-8 border-r bg-sidebar p-12 lg:flex">
      <BrandPanelContent
        productName={branding.websiteName}
        iconUrl={branding.logos.logoIconUrl}
        welcomeText={branding.welcomeText ?? ''}
      />
    </aside>
  );
}

function BrandPanelContent({
  productName,
  iconUrl,
  welcomeText,
}: BrandPanelContentProps) {
  const trimmedWelcomeText = welcomeText.trim();
  return (
    <>
      <div className="flex items-center gap-3">
        <img
          src={iconUrl}
          alt=""
          className="size-9 rounded-md object-contain"
        />
        <span className="text-lg font-semibold">{productName}</span>
      </div>
      <div className="flex flex-col gap-3">
        {trimmedWelcomeText.length > 0 && (
          <p className="max-w-md text-3xl font-semibold leading-snug text-foreground">
            {trimmedWelcomeText}
          </p>
        )}
        <p className="max-w-md text-sm text-muted-foreground">
          {t(
            'Connect your systems, automate the work between them, and keep every run under control.',
          )}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">{productName}</span>
    </>
  );
}

const SETUP_PATH = '/setup';

type AuthLandingProps = {
  initialMode: AuthMode;
};

type BrandPanelContentProps = {
  productName: string;
  iconUrl: string;
  welcomeText: string;
};

export { BrandPanelContent };
export type { BrandPanelContentProps };
