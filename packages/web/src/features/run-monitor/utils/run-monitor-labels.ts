import { RunMonitorBucketUnit, RunMonitorRange } from '@fema-ipaas/shared';
import { t } from 'i18next';

function range(value: RunMonitorRange): string {
  switch (value) {
    case RunMonitorRange.LAST_15_MINUTES:
      return t('Last 15 minutes');
    case RunMonitorRange.LAST_HOUR:
      return t('Last 1 hour');
    case RunMonitorRange.LAST_24_HOURS:
      return t('Last 24 hours');
    case RunMonitorRange.LAST_7_DAYS:
      return t('Last 7 days');
    case RunMonitorRange.LAST_30_DAYS:
      return t('Last 30 days');
  }
}

function granularity({
  unit,
  step,
}: {
  unit: RunMonitorBucketUnit;
  step: number;
}): string {
  switch (unit) {
    case RunMonitorBucketUnit.DAY:
      return t('Daily');
    case RunMonitorBucketUnit.HOUR:
      return t('Hourly');
    case RunMonitorBucketUnit.MINUTE:
      return t('Every {count} minutes', { count: step });
  }
}

export const runMonitorLabels = {
  range,
  granularity,
};
