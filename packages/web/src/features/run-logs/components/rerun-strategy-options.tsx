import { WorkflowRetryStrategy } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export function RerunStrategyOptions({
  value,
  onChange,
}: {
  value: WorkflowRetryStrategy;
  onChange: (strategy: WorkflowRetryStrategy) => void;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) =>
        onChange(
          next === WorkflowRetryStrategy.ON_LATEST_VERSION
            ? WorkflowRetryStrategy.ON_LATEST_VERSION
            : WorkflowRetryStrategy.FROM_FAILED_STEP,
        )
      }
      className="flex flex-col gap-3"
    >
      <label className="flex items-start gap-3">
        <RadioGroupItem
          value={WorkflowRetryStrategy.FROM_FAILED_STEP}
          id="rerun-from-failed-step"
        />
        <span className="flex flex-col gap-0.5">
          <Label htmlFor="rerun-from-failed-step">
            {t('Rerun from the failed step')}
          </Label>
          <span className="text-xs text-muted-foreground">
            {t(
              'Continues the same run on its original version. Steps that already succeeded keep their results and are not called again.',
            )}
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <RadioGroupItem
          value={WorkflowRetryStrategy.ON_LATEST_VERSION}
          id="rerun-whole-run"
        />
        <span className="flex flex-col gap-0.5">
          <Label htmlFor="rerun-whole-run">{t('Rerun the whole run')}</Label>
          <span className="text-xs text-muted-foreground">
            {t(
              'Starts a new run from the trigger with the same input on the latest published version. The new log links back to this one.',
            )}
          </span>
        </span>
      </label>
    </RadioGroup>
  );
}
