import { PublicTenantInfo } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Link } from 'react-router-dom';

import { tenantContext } from '@/lib/tenant-context';

import { ssoUtils } from '../utils/sso-utils';

import { SsoLoginOptions } from './sso-login-options';
import { TenantLogo } from './tenant-selection-step';

function TenantDiscoveryPanel({ tenants }: TenantDiscoveryPanelProps) {
  const withSso = tenants.filter((tenant) => tenant.ssoProviders.length > 0);
  if (withSso.length === 0) {
    return null;
  }
  return (
    <div className="mb-5 grid gap-4" data-testid="tenant-discovery">
      {withSso.map((tenant) => (
        <div
          key={tenant.id}
          className="grid gap-3 rounded-xl border bg-muted/30 p-3"
          data-testid={`tenant-discovery-${tenant.slug}`}
        >
          <div className="flex items-center gap-2.5">
            <TenantLogo name={tenant.name} logoUrl={tenant.logoIconUrl} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {tenant.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('Your organization uses single sign-on.')}
              </span>
            </div>
          </div>
          <SsoLoginOptions
            providers={ssoUtils.fromPublicEntries(tenant.ssoProviders)}
            withDivider={false}
            tenant={tenant.slug}
          />
          <Link
            to={tenantContext.loginPath(tenant.slug)}
            className="text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t('Open the {name} sign-in page', { name: tenant.name })}
          </Link>
        </div>
      ))}
      <p className="text-center text-xs text-muted-foreground">
        {t('Or continue with your email below.')}
      </p>
    </div>
  );
}

export { TenantDiscoveryPanel };

type TenantDiscoveryPanelProps = {
  tenants: PublicTenantInfo[];
};
