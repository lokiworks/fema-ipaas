import { t } from 'i18next';

import LanguageToggle from '@/app/components/account-settings/language-toggle';
import {
  AccessTokensCard,
  AccountProfileCard,
  AppearanceCard,
  accountUtils,
  NotificationPreferencesCard,
} from '@/features/account';
import { tenantAccessHooks, tenantAccessUtils } from '@/features/tenant-access';
import { tenantHooks } from '@/hooks/tenant-hooks';
import { userHooks } from '@/hooks/user-hooks';

export function AccountPage() {
  const { data: user } = userHooks.useCurrentUser();
  const { tenant } = tenantHooks.useCurrentTenant();
  const { data: access } = tenantAccessHooks.useMyAccess();

  if (!user) {
    return null;
  }

  const details = [
    { label: t('Email'), value: user.email },
    {
      label: t('Platform role'),
      value: tenantAccessUtils.roleLabel({
        tenantRole: user.tenantRole,
        isOwner: tenant.ownerId === user.id,
      }),
    },
    {
      label: t('Module access'),
      value: (access?.modules ?? [])
        .map((module) => tenantAccessUtils.moduleLabel(module))
        .join(' · '),
    },
    { label: t('Time zone'), value: accountUtils.timezoneLabel() },
  ];

  return (
    <div className="flex w-full max-w-[1100px] flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('Personal settings')}</h1>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <AccountProfileCard user={user} details={details} />
        <div className="flex flex-col gap-6">
          <AppearanceCard>
            <LanguageToggle />
          </AppearanceCard>
          <NotificationPreferencesCard />
        </div>
      </div>
      <AccessTokensCard />
    </div>
  );
}
