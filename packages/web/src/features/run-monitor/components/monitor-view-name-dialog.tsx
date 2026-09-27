import {
  RUN_MONITOR_VIEW_NAME_MAX_LENGTH,
  RunMonitorViewName,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import { cn } from '@/lib/utils';

export function MonitorViewNameDialog({
  state,
  takenNames,
  summary,
  onOpenChange,
  onSubmit,
}: {
  state: ViewNameDialogState | null;
  takenNames: string[];
  summary: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (params: { mode: ViewNameMode; name: string }) => Promise<void>;
}) {
  const open = state !== null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {state && (
          <ViewNameForm
            key={`${state.mode}-${state.initial}`}
            state={state}
            takenNames={takenNames}
            summary={summary}
            onOpenChange={onOpenChange}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ViewNameForm({
  state,
  takenNames,
  summary,
  onOpenChange,
  onSubmit,
}: {
  state: ViewNameDialogState;
  takenNames: string[];
  summary: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (params: { mode: ViewNameMode; name: string }) => Promise<void>;
}) {
  const schema = z
    .object({ name: RunMonitorViewName })
    .superRefine((values, ctx) => {
      if (takenNames.includes(values.name.trim())) {
        ctx.addIssue({
          code: 'custom',
          path: ['name'],
          message: 'runMonitorViewNameTaken',
        });
      }
    });
  const form = useForm<ViewNameValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { name: state.initial },
  });
  const name = form.watch('name');
  const length = name.trim().length;

  const handleSubmit = async (values: ViewNameValues) => {
    form.clearErrors('root.serverError');
    try {
      await onSubmit({ mode: state.mode, name: values.name.trim() });
      onOpenChange(false);
    } catch {
      form.setError('root.serverError', {
        type: 'manual',
        message: t('Could not save the view, please try again'),
      });
    }
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <DialogHeader>
          <DialogTitle>
            {state.mode === 'rename' ? t('Rename view') : t('Save as view')}
          </DialogTitle>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-2">
                <FormLabel>{t('View name')}</FormLabel>
                <span
                  className={cn(
                    'text-xs tabular-nums',
                    length > RUN_MONITOR_VIEW_NAME_MAX_LENGTH
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {length}/{RUN_MONITOR_VIEW_NAME_MAX_LENGTH}
                </span>
              </div>
              <FormControl>
                <Input
                  {...field}
                  autoFocus
                  placeholder={t('e.g. HR · last 7 days')}
                />
              </FormControl>
              {state.mode === 'create' && summary.length > 0 && (
                <FormDescription>
                  {t('Saves the current filters: {summary}', { summary })}
                </FormDescription>
              )}
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
          <Button type="submit" loading={form.formState.isSubmitting}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

type ViewNameValues = {
  name: string;
};

export type ViewNameMode = 'create' | 'rename';

export type ViewNameDialogState = {
  mode: ViewNameMode;
  initial: string;
};
