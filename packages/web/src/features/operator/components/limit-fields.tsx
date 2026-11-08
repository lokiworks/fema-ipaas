import { t } from 'i18next';
import { useFormContext } from 'react-hook-form';

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import { LimitField, LimitInputs } from '../utils/operator-utils';

export function LimitFields() {
  const { control } = useFormContext<LimitsShape>();
  const numeric: { field: LimitField; label: string }[] = [
    { field: 'usersLimit', label: t('Members') },
    { field: 'projectsLimit', label: t('Projects') },
    { field: 'activeWorkflowsLimit', label: t('Active workflows') },
    { field: 'concurrentExecutionsLimit', label: t('Concurrent runs') },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        {numeric.map(({ field: name, label }) => (
          <FormField
            key={name}
            control={control}
            name={`limits.${name}`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{label}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    inputMode="numeric"
                    placeholder={t('Unlimited')}
                    data-testid={`limit-${name}`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
      </div>
      <FormField
        control={control}
        name="limits.workerGroupId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Worker group')}</FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder={t('Shared workers')}
                data-testid="limit-workerGroupId"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <p className="text-xs text-muted-foreground">
        {t('Leave a field empty for no limit. 0 blocks new items.')}
      </p>
    </div>
  );
}

type LimitsShape = { limits: LimitInputs };
