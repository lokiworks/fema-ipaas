import {
  ApFlagId,
  ColorName,
  TenantRole,
  WORKSPACE_COLOR_PALETTE,
  WorkspaceIcon,
  WorkspaceType,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { UseFormReturn } from 'react-hook-form';

import { ClearableInput } from '@/components/custom/clearable-input';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { workspaceCollectionUtils } from '@/features/workspaces';
import { flagsHooks } from '@/hooks/flags-hooks';
import { userHooks } from '@/hooks/user-hooks';
import { cn } from '@/lib/utils';

export type FormValues = {
  workspaceName: string;
  icon: WorkspaceIcon;
  externalId?: string;
  maxConcurrentJobs?: number | null;
  activeWorkflowsLimit?: number | null;
};

type GeneralSettingsProps = {
  form: UseFormReturn<FormValues>;
};

export const GeneralSettings = ({ form }: GeneralSettingsProps) => {
  const tenantRole = userHooks.getCurrentUserTenantRole();
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const { workspace } = workspaceCollectionUtils.useCurrentWorkspace();
  const { data: isRateLimiterEnabled } = flagsHooks.useFlag<boolean>(
    ApFlagId.WORKSPACE_RATE_LIMITER_ENABLED,
  );
  const { data: defaultConcurrentJobsLimit } = flagsHooks.useFlag<number>(
    ApFlagId.DEFAULT_CONCURRENT_JOBS_LIMIT,
  );
  const showGeneralSettings = workspace.type === WorkspaceType.TEAM;

  const colorOptions = Object.values(ColorName);

  return (
    <Form {...form}>
      <div className="space-y-6">
        {showGeneralSettings && (
          <div>
            <Label htmlFor="workspaceName" className="text-sm font-medium">
              {t('Workspace Name')}
            </Label>
            <div className="flex mt-2">
              <FormField
                name="icon"
                render={({ field }) => {
                  const currentColor: ColorName = field.value.color;
                  return (
                    <FormItem>
                      <Popover
                        open={colorPickerOpen}
                        onOpenChange={setColorPickerOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 px-3 rounded-r-none border-r flex items-center gap-1"
                            disabled={form.formState.disabled}
                          >
                            <div
                              className="h-3 w-3 rounded-none shrink-0"
                              style={{
                                backgroundColor:
                                  WORKSPACE_COLOR_PALETTE[currentColor].color,
                              }}
                            />
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3" align="start">
                          <div className="grid grid-cols-6 gap-2">
                            {colorOptions.map((colorName) => (
                              <Button
                                key={colorName}
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  'h-8 w-8 rounded-sm transition-all hover:scale-110 p-0',
                                  currentColor === colorName &&
                                    'ring-2 ring-offset-2 ring-foreground',
                                )}
                                style={{
                                  backgroundColor:
                                    WORKSPACE_COLOR_PALETTE[colorName].color,
                                }}
                                onClick={() => {
                                  field.onChange({ color: colorName });
                                  setColorPickerOpen(false);
                                }}
                                disabled={form.formState.disabled}
                              />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                name="workspaceName"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <Input
                      {...field}
                      id="workspaceName"
                      placeholder={t('Workspace Name')}
                      className="h-10 rounded-l-none border-l-0"
                      disabled={form.formState.disabled}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}
        {tenantRole === TenantRole.ADMIN && (
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
                  disabled={form.formState.disabled || !isRateLimiterEnabled}
                />
                <FormDescription className="text-xs text-muted-foreground">
                  {isRateLimiterEnabled === false
                    ? t(
                        'The rate limiting feature is disabled. Enable the WORKSPACE_RATE_LIMITER_ENABLED environment variable to use this feature.',
                      )
                    : t(
                        'Maximum number of workflows that can run at the same time for this workspace',
                      )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {tenantRole === TenantRole.ADMIN && (
          <FormField
            name="activeWorkflowsLimit"
            render={({ field }) => (
              <FormItem>
                <Label
                  htmlFor="activeWorkflowsLimit"
                  className="text-sm font-medium"
                >
                  {t('Active Workflows Limit')}
                </Label>
                <ClearableInput
                  {...field}
                  id="activeWorkflowsLimit"
                  type="number"
                  min={1}
                  placeholder={t('Unlimited')}
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
                    'Maximum number of enabled workflows in this workspace. Leave empty for no limit.',
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
