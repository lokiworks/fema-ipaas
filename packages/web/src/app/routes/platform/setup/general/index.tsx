import { t } from 'i18next';

import { CenteredPage } from '@/app/components/centered-page';
import { AppearanceSection } from '@/app/routes/platform/setup/general/appearance-section';
import { Separator } from '@/components/ui/separator';
import { platformHooks } from '@/hooks/platform-hooks';
import { userHooks } from '@/hooks/user-hooks';

export const GeneralPage = () => {
  const { platform } = platformHooks.useCurrentPlatform();
  const { data: user } = userHooks.useCurrentUser();

  const canDeletePlatform = false && platform.ownerId === user?.id;

  return (
    <CenteredPage
      title={t('General')}
      description={t('Change the settings for your platform.')}
    >
      <AppearanceSection />
      {canDeletePlatform && (
        <>
          <Separator className="my-8" />
        </>
      )}
    </CenteredPage>
  );
};

export default GeneralPage;
