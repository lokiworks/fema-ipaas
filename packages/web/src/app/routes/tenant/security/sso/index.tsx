import { t } from 'i18next';
import { MailIcon, Earth } from 'lucide-react';
import { toast } from 'sonner';

import { CenteredPage } from '@/app/components/centered-page';
import { AllowedDomainDialog } from '@/app/routes/tenant/security/sso/allowed-domain';
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from '@/components/custom/item';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ssoMutations } from '@/features/tenant-admin';
import { tenantHooks } from '@/hooks/tenant-hooks';

const AuthenticationPage = () => {
  const { tenant, refetch } = tenantHooks.useCurrentTenant();

  const emailAuthEnabled = tenant.emailAuthEnabled;

  const { mutate: toggleEmailAuthentication, isPending: isEmailAuthPending } =
    ssoMutations.useUpdateTenantSso({
      tenantId: tenant.id,
      refetch,
      onSuccess: () => {
        toast.success(t('Email authentication updated'), { duration: 3000 });
      },
    });

  return (
    <CenteredPage
      title={t('Authentication')}
      description={t('Control how people sign in to this tenant')}
    >
      <div className="flex flex-col gap-4">
        <Item variant="outline">
          <ItemMedia variant="icon">
            <Earth />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{t('Allowed Domains')}</ItemTitle>
            <ItemDescription>
              {t('Restrict authentication to specific email domains.')}
            </ItemDescription>
            {(tenant?.allowedAuthDomains ?? []).length > 0 && (
              <div className="mt-1 gap-2 flex">
                {(tenant?.allowedAuthDomains ?? []).map((text, index) => (
                  <Badge key={index} variant={'outline'}>
                    {text}
                  </Badge>
                ))}
              </div>
            )}
          </ItemContent>
          <ItemActions>
            <AllowedDomainDialog tenant={tenant} refetch={refetch} />
          </ItemActions>
        </Item>

        <Item variant="outline">
          <ItemMedia variant="icon">
            <MailIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{t('Allowed Email Login')}</ItemTitle>
            <ItemDescription>
              {t('Allow logins through email and password.')}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Switch
              aria-label={t('Allowed Email Login')}
              checked={emailAuthEnabled}
              onCheckedChange={() =>
                toggleEmailAuthentication({
                  emailAuthEnabled: !tenant.emailAuthEnabled,
                })
              }
              disabled={isEmailAuthPending}
            />
          </ItemActions>
        </Item>
      </div>
    </CenteredPage>
  );
};

AuthenticationPage.displayName = 'AuthenticationPage';
export { AuthenticationPage };
