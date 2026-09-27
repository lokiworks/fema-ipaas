import { ProjectLimitsRow } from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { limitsHooks } from '../hooks/limits-hooks';
import { EditProjectLimitsForm, limitsUtils } from '../utils/limits-utils';

export function EditProjectLimitsDialog({
  row,
  workflowsCeiling,
  monthlyRunsCeiling,
  onOpenChange,
}: {
  row: ProjectLimitsRow | null;
  workflowsCeiling: number;
  monthlyRunsCeiling: number;
  onOpenChange: (open: boolean) => void;
}) {
  const open = row !== null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {row && (
          <EditProjectLimitsFormBody
            key={row.projectId}
            row={row}
            workflowsCeiling={workflowsCeiling}
            monthlyRunsCeiling={monthlyRunsCeiling}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditProjectLimitsFormBody({
  row,
  workflowsCeiling,
  monthlyRunsCeiling,
  onOpenChange,
}: {
  row: ProjectLimitsRow;
  workflowsCeiling: number;
  monthlyRunsCeiling: number;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate: save, isPending } = limitsHooks.useUpdateProjectLimits();
  const form = useForm<EditProjectLimitsForm>({
    resolver: zodResolver(
      limitsUtils.editFormSchema({
        workflowsCeiling,
        monthlyRunsCeiling,
        currentWorkflows: row.workflows.used,
      }),
    ),
    mode: 'onChange',
    defaultValues: defaultValuesFor(row),
  });
  const runsInput = limitsUtils.parseLimitInput(form.watch('monthlyRunsLimit'));
  const lowersBelowUsage =
    runsInput.kind === 'value' && runsInput.value < row.monthlyRuns.used;

  const handleSubmit = (values: EditProjectLimitsForm) => {
    form.clearErrors('root.serverError');
    save(
      {
        projectId: row.projectId,
        request: {
          workflowsLimit: limitsUtils.toRequestValue(values.workflowsLimit),
          monthlyRunsLimit: limitsUtils.toRequestValue(values.monthlyRunsLimit),
        },
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: () =>
          form.setError('root.serverError', {
            type: 'manual',
            message: t(
              'Could not save the limits. Check the values and try again.',
            ),
          }),
      },
    );
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <DialogHeader>
          <DialogTitle>
            {t('Adjust limits of {name}', { name: row.displayName })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Leave a field empty to follow the instance limit. Changes apply to new workflows and runs right away.',
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="workflowsLimit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Workflow limit')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  inputMode="numeric"
                  placeholder={formatUtils.formatNumber(workflowsCeiling)}
                />
              </FormControl>
              <FormDescription>
                {t('{used} workflows now, at most {max}', {
                  used: formatUtils.formatNumber(row.workflows.used),
                  max: formatUtils.formatNumber(workflowsCeiling),
                })}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="monthlyRunsLimit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Monthly run limit')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  inputMode="numeric"
                  placeholder={formatUtils.formatNumber(monthlyRunsCeiling)}
                />
              </FormControl>
              <FormDescription
                className={cn(lowersBelowUsage && 'text-amber-600')}
              >
                {lowersBelowUsage
                  ? t(
                      "{used} runs already this month; the rest of this month's runs will be refused",
                      { used: formatUtils.formatNumber(row.monthlyRuns.used) },
                    )
                  : t('{used} runs this month, at most {max}', {
                      used: formatUtils.formatNumber(row.monthlyRuns.used),
                      max: formatUtils.formatNumber(monthlyRunsCeiling),
                    })}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root?.serverError && (
          <p className="text-sm text-destructive">
            {form.formState.errors.root.serverError.message}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function defaultValuesFor(row: ProjectLimitsRow): EditProjectLimitsForm {
  return {
    workflowsLimit:
      row.workflows.override === null ? '' : String(row.workflows.override),
    monthlyRunsLimit:
      row.monthlyRuns.override === null ? '' : String(row.monthlyRuns.override),
  };
}
