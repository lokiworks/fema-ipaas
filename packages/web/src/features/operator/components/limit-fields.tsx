import { t } from 'i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { LimitField, LimitInputs } from '../utils/operator-utils';

export function LimitFields({
  value,
  onChange,
  invalidField,
}: {
  value: LimitInputs;
  onChange: (value: LimitInputs) => void;
  invalidField: LimitField | null;
}) {
  const numeric: { field: LimitField; label: string }[] = [
    { field: 'usersLimit', label: t('Members') },
    { field: 'projectsLimit', label: t('Projects') },
    { field: 'activeWorkflowsLimit', label: t('Active workflows') },
    { field: 'concurrentExecutionsLimit', label: t('Concurrent runs') },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        {numeric.map(({ field, label }) => (
          <div key={field} className="flex flex-col gap-1.5">
            <Label htmlFor={`limit-${field}`}>{label}</Label>
            <Input
              id={`limit-${field}`}
              inputMode="numeric"
              placeholder={t('Unlimited')}
              value={value[field]}
              aria-invalid={invalidField === field}
              data-testid={`limit-${field}`}
              onChange={(event) =>
                onChange({ ...value, [field]: event.target.value })
              }
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="limit-workerGroupId">{t('Worker group')}</Label>
        <Input
          id="limit-workerGroupId"
          placeholder={t('Shared workers')}
          value={value.workerGroupId}
          data-testid="limit-workerGroupId"
          onChange={(event) =>
            onChange({ ...value, workerGroupId: event.target.value })
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {invalidField === null
          ? t('Leave a field empty for no limit. 0 blocks new items.')
          : t('Limits must be whole numbers of 0 or more.')}
      </p>
    </div>
  );
}
