import { TenantMfaPolicy } from '@fema-ipaas/shared';
import { t } from 'i18next';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { tenantAccessHooks } from '@/features/tenant-access';

export function MfaPolicyCard({
  mfaPolicy,
  phoneAuthEnabled,
}: {
  mfaPolicy: TenantMfaPolicy;
  phoneAuthEnabled: boolean;
}) {
  const { mutate: update, isPending } = tenantAccessHooks.useUpdateMfaPolicy();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Two-step verification')}</CardTitle>
        <CardDescription>
          {t(
            'An authenticator app code after the password or a one-time code. Single sign-on is not asked again, the identity provider is responsible for it.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              {t('Require it for every member')}
            </span>
            <span className="text-sm text-muted-foreground">
              {t(
                'Members who have not set it up are asked to do so at their next sign-in. Off: each member decides.',
              )}
            </span>
          </div>
          <Switch
            aria-label={t('Require it for every member')}
            checked={mfaPolicy === TenantMfaPolicy.REQUIRED}
            disabled={isPending}
            data-testid="switch-mfa-required"
            onCheckedChange={(checked) =>
              update({
                mfaPolicy: checked
                  ? TenantMfaPolicy.REQUIRED
                  : TenantMfaPolicy.OPTIONAL,
                phoneAuthEnabled,
              })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
