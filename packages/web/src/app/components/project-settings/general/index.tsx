import { FlagId, TenantRole } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { UseFormReturn } from 'react-hook-form';

import { ClearableInput } from '@/components/custom/clearable-input';
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { flagsHooks } from '@/hooks/flags-hooks';
import { userHooks } from '@/hooks/user-hooks';

type GeneralSettingsProps = {
  form: UseFormReturn<FormValues>;
};

export const GeneralSettings = ({ form }: GeneralSettingsProps) => {
  const tenantRole = userHooks.getCurrentUserTenantRole();
  const { data: isRateLimiterEnabled } = flagsHooks.useFlag<boolean>(
    FlagId.PROJECT_RATE_LIMITER_ENABLED,
  );
  const { data: defaultConcurrentJobsLimit } = flagsHooks.useFlag<number>(
    FlagId.DEFAULT_CONCURRENT_JOBS_LIMIT,
  );
  return (
    <Form {...form}>
      <div className="space-y-6">
        {tenantRole === TenantRole.ADMIN && isRateLimiterEnabled && (
          <FormField
            name="maxConcurrentJobs"
            render={({ field }) => (
              <FormItem>
                <Label
                  htmlFor="maxConcurrentJobs"
                  className="text-sm font-medium"
                >
                  {t('Max Concurrent Jobs')}
                </Label>
                <ClearableInput
                  {...field}
                  id="maxConcurrentJobs"
                  type="number"
                  min={1}
                  placeholder={
                    defaultConcurrentJobsLimit
                      ? t('Default ({value})', {
                          value: defaultConcurrentJobsLimit,
                        })
                      : t('Default')
                  }
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  onClear={() => field.onChange(null)}
                  disabled={form.formState.disabled}
                />
                <FormDescription className="text-xs text-muted-foreground">
                  {t(
                    'Maximum number of workflows that can run at the same time for this project',
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
    </Form>
  );
};

export type FormValues = {
  maxConcurrentJobs?: number | null;
};
