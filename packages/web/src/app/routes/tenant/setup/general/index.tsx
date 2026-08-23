import { t } from 'i18next';

import { CenteredPage } from '@/app/components/centered-page';
import { AppearanceSection } from '@/app/routes/tenant/setup/general/appearance-section';
import { Separator } from '@/components/ui/separator';
import { tenantHooks } from '@/hooks/tenant-hooks';
import { userHooks } from '@/hooks/user-hooks';

export const GeneralPage = () => {
  const { tenant } = tenantHooks.useCurrentTenant();
  const { data: user } = userHooks.useCurrentUser();

  const canDeleteTenant = false && tenant.ownerId === user?.id;

  return (
    <CenteredPage
      title={t('General')}
      description={t('Change the settings for your tenant.')}
    >
      <AppearanceSection />
      {canDeleteTenant && (
        <>
          <Separator className="my-8" />
        </>
      )}
    </CenteredPage>
  );
};

export default GeneralPage;
