import { isNil } from '@fema-ipaas/core-utils';
import { t } from 'i18next';
import { Inbox } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const EmptyPollNotice = ({
  mockData,
  isSaving,
  onUseSampleData,
}: EmptyPollNoticeProps) => {
  const hasSampleData =
    !isNil(mockData) && JSON.stringify(mockData) !== '{}';
  return (
    <Alert variant="primary" data-testid="empty-poll-notice">
      <Inbox className="size-4" />
      <AlertTitle>{t('No matching data recently')}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>
          {hasSampleData
            ? t(
                'The trigger checked with the current settings and found no records. Adjust the settings and test again, or keep building with the sample data.',
              )
            : t(
                'The trigger checked with the current settings and found no records. Adjust the settings and test again.',
              )}
        </span>
        {hasSampleData && (
          <Button
            variant="outline"
            size="sm"
            loading={isSaving}
            onClick={() => onUseSampleData(mockData)}
          >
            {t('Continue with sample data')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};

type EmptyPollNoticeProps = {
  mockData: unknown;
  isSaving: boolean;
  onUseSampleData: (mockData: unknown) => void;
};
