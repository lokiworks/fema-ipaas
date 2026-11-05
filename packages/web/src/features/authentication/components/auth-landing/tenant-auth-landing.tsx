import { PublicTenantInfo } from '@fema-ipaas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { Loader2 } from 'lucide-react';
import { CSSProperties, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { colorContrast } from '@/lib/color-contrast';
import { colorsUtils } from '@/lib/color-utils';
import { primaryColorUtils } from '@/lib/primary-color-utils';
import { tenantContext } from '@/lib/tenant-context';

import { tenantLoginHooks } from '../../hooks/tenant-login-hooks';

import { AuthMode } from './auth-drawer-body';
import { AuthLanding, AuthSplitLayout } from './auth-landing';
import { TenantLoginContext } from './tenant-login-context';

function TenantAuthLanding({
  slug,
  initialMode,
  fallbackToGenericWhenMissing,
}: TenantAuthLandingProps) {
  const {
    data: tenant,
    isLoading,
    isError,
  } = tenantLoginHooks.usePublicTenant(slug);

  if (isLoading) {
    return (
      <AuthSplitLayout>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </AuthSplitLayout>
    );
  }

  if (isError || tenant === undefined) {
    if (fallbackToGenericWhenMissing) {
      return <GenericLanding initialMode={initialMode} />;
    }
    return <TenantNotFound />;
  }

  return (
    <TenantScope tenant={tenant}>
      <AuthLanding initialMode={initialMode} />
    </TenantScope>
  );
}

function GenericLanding({ initialMode }: { initialMode: AuthMode }) {
  const [cleared] = useState(() => {
    tenantContext.clear();
    return true;
  });
  return cleared ? <AuthLanding initialMode={initialMode} /> : null;
}

function TenantScope({ tenant, children }: TenantScopeProps) {
  const queryClient = useQueryClient();
  const [ready] = useState(() => {
    tenantContext.set(tenant.slug);
    return true;
  });

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['flags'] });
    queryClient.invalidateQueries({ queryKey: ['sso-providers'] });
  }, [queryClient, tenant.slug]);

  if (!ready) {
    return null;
  }

  return (
    <TenantLoginContext.Provider value={tenant}>
      <div className="contents" style={colorVariables(tenant.primaryColor)}>
        {children}
      </div>
    </TenantLoginContext.Provider>
  );
}

function TenantNotFound() {
  return (
    <AuthSplitLayout>
      <section
        className="w-full max-w-[400px] rounded-2xl border bg-background p-8 text-center shadow-sm"
        data-testid="tenant-not-found"
      >
        <h1 className="text-xl">{t('Organization not found')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            'Check the sign-in address you were given, or sign in without choosing an organization.',
          )}
        </p>
        <Button
          className="mt-6"
          variant="outline"
          onClick={() => {
            tenantContext.clear();
            window.location.assign('/sign-in');
          }}
        >
          {t('Go to sign in')}
        </Button>
      </section>
    </AuthSplitLayout>
  );
}

function colorVariables(color: string): CSSProperties {
  if (!colorContrast.isReadableOnWhite(color)) {
    return {};
  }
  const variables: Record<string, string> = {
    '--primary': colorsUtils.hexToHslString(color),
    '--primary-foreground': colorsUtils.hexToHslString(
      primaryColorUtils.readableForeground({ hex: color }),
    ),
  };
  return variables;
}

export { TenantAuthLanding };

type TenantAuthLandingProps = {
  slug: string;
  initialMode: AuthMode;
  fallbackToGenericWhenMissing: boolean;
};

type TenantScopeProps = {
  tenant: PublicTenantInfo;
  children: React.ReactNode;
};
