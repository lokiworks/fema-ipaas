import { SsoDomainVerificationStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CheckCircle, LockIcon, MailIcon, Earth } from 'lucide-react';
import { toast } from 'sonner';

import { CenteredPage } from '@/app/components/centered-page';
import { AllowedDomainDialog } from '@/app/routes/tenant/security/sso/allowed-domain';
import { ConfigureSamlDialog } from '@/app/routes/tenant/security/sso/saml-dialog';
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

import GoogleIcon from '../../../../../assets/img/custom/auth/google-icon.svg';

const SSOPage = () => {
  const { tenant, refetch } = tenantHooks.useCurrentTenant();

  const samlConnected = !!tenant.federatedAuthProviders?.saml;
  const ssoDomainVerified =
    tenant.ssoDomainVerification?.status ===
    SsoDomainVerificationStatus.VERIFIED;
  const emailAuthEnabled = tenant.emailAuthEnabled;

  const { mutate: toggleEmailAuthentication, isPending: isEmailAuthPending } =
    ssoMutations.useUpdateTenantSso({
      tenantId: tenant.id,
      refetch,
      onSuccess: () => {
        toast.success(t('Email authentication updated'), { duration: 3000 });
      },
    });

  const { mutate: toggleGoogleAuth, isPending: isGoogleAuthPending } =
    ssoMutations.useUpdateTenantSso({
      tenantId: tenant.id,
      refetch,
      onSuccess: () => {
        toast.success(t('Google authentication updated'), { duration: 3000 });
      },
    });

  return (
    <CenteredPage
      title={t('Single Sign On')}
      description={t('Manage single sign on providers')}
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
            <img className="size-6" src={GoogleIcon} alt="icon" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Google</ItemTitle>
            <ItemDescription>
              {t("Allow logins through google's single sign-on functionality.")}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Switch
              checked={tenant.googleAuthEnabled}
              onCheckedChange={() =>
                toggleGoogleAuth({
                  googleAuthEnabled: !tenant.googleAuthEnabled,
                })
              }
              disabled={isGoogleAuthPending}
            />
          </ItemActions>
        </Item>

        <Item variant="outline">
          <ItemMedia variant="icon">
            <LockIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{t('SAML 2.0')}</ItemTitle>
            <ItemDescription>
              {t(
                "Allow logins through saml 2.0's single sign-on functionality.",
              )}
            </ItemDescription>
            {tenant.ssoDomain && (
              <div className="mt-1 gap-2 flex items-center">
                <Badge variant="outline">{tenant.ssoDomain}</Badge>
                {ssoDomainVerified ? (
                  <span className="flex items-center gap-1 text-xs text-success-600">
                    <CheckCircle className="size-3" />
                    {t('Verified')}
                  </span>
                ) : (
                  <span className="text-xs text-warning">
                    {t('Pending verification')}
                  </span>
                )}
              </div>
            )}
          </ItemContent>
          <ItemActions>
            <ConfigureSamlDialog
              tenant={tenant}
              refetch={refetch}
              connected={samlConnected}
            />
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

SSOPage.displayName = 'SSOPage';
export { SSOPage };
