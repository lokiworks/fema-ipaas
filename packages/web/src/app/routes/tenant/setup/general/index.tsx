import { t } from 'i18next';

import { AppearanceSection } from '@/app/routes/tenant/setup/general/appearance-section';
import { ConsolePage } from '@/components/custom/console-page';
import { Separator } from '@/components/ui/separator';
import { tenantHooks } from '@/hooks/tenant-hooks';
import { userHooks } from '@/hooks/user-hooks';

export const GeneralPage = () => {
  const { tenant } = tenantHooks.useCurrentTenant();
  const { data: user } = userHooks.useCurrentUser();

  const canDeleteTenant = false && tenant.ownerId === user?.id;

  return (
    <ConsolePage
      title={t('General')}
      description={t('Change the settings for your tenant.')}
    >
      <AppearanceSection />
      {canDeleteTenant && (
        <>
          <Separator className="my-8" />
        </>
      )}
    </ConsolePage>
  );
};

export default GeneralPage;
