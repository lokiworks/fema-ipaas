import { isNil } from '@fema-ipaas/core-utils';
import { t } from 'i18next';

import { Button } from '@/components/ui/button';

import { TestType } from './trigger-event-utils';

export const FirstTimeTestingSection = ({
  testType,
  mockData,
  isSaving,
  onSaveMockAsSampleData,
}: FirstTimeTestingSectionProps) => {
  const canUseMockData =
    (testType === 'simulation' ||
      testType === 'webhook' ||
      testType === 'chat-trigger') &&
    !isNil(mockData) &&
    JSON.stringify(mockData) !== '{}';
  if (!canUseMockData) {
    return null;
  }
  return (
    <div className="flex justify-center flex-col gap-2 items-center">
      {t('Or')}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSaveMockAsSampleData(mockData)}
        loading={isSaving}
      >
        {t('Use Mock Data')}
      </Button>
    </div>
  );
};

type FirstTimeTestingSectionProps = {
  testType: TestType;
  mockData: unknown;
  isSaving: boolean;
  onSaveMockAsSampleData: (mockData: unknown) => void;
};
