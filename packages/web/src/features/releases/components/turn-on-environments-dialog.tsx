import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { projectCollectionUtils } from '@/features/projects';
import { api } from '@/lib/api';

import { releasesHooks } from '../hooks/releases-hooks';

import { ApproverCheckboxList } from './approver-checkbox-list';

export function TurnOnEnvironmentsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <TurnOnEnvironmentsForm
          key={open ? 'open' : 'closed'}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function TurnOnEnvironmentsForm({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const { project } = projectCollectionUtils.useCurrentProject();
  const { mutate: updateEnvironments, isPending } =
    releasesHooks.useUpdateEnvironments();
  const form = useForm<TurnOnFormValues>({
    resolver: zodResolver(TurnOnFormSchema),
    mode: 'onChange',
    defaultValues: defaultValuesFor(project.ownerId),
  });
  const requireApproval = form.watch('requireApproval');

  const handleSubmit = (values: TurnOnFormValues) => {
    form.clearErrors('root.serverError');
    updateEnvironments(
      {
        projectId: project.id,
        enabled: true,
        approverIds: values.requireApproval ? values.approverIds : [],
      },
      {
        onSuccess: () => {
          toast.success(t('Test and production are on'));
          onOpenChange(false);
        },
        onError: (error) =>
          form.setError('root.serverError', {
            type: 'manual',
            message: api.extractServerErrorMessage(
              error,
              t('Something went wrong'),
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
          <DialogTitle>{t('Turn on test and production')}</DialogTitle>
          <DialogDescription>{t('After you turn this on:')}</DialogDescription>
        </DialogHeader>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>
            {t(
              'Publishing in the editor goes to test first. The Publish button becomes Deploy to test.',
            )}
          </li>
          <li>
            {t(
              'Production changes only when a workflow is promoted from test.',
            )}
          </li>
          <li>
            {t('Promotions can require approval from people you choose.')}
          </li>
          <li>
            {t(
              'Test runs use test variable values and test connection replacements.',
            )}
          </li>
        </ul>
        <FormField
          control={form.control}
          name="requireApproval"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked === true);
                    form.setValue(
                      'approverIds',
                      checked === true ? [project.ownerId] : [],
                      { shouldValidate: true },
                    );
                  }}
                />
              </FormControl>
              <FormLabel>{t('Promotions need approval')}</FormLabel>
              <FormMessage />
            </FormItem>
          )}
        />
        {requireApproval && (
          <FormField
            control={form.control}
            name="approverIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Approvers')}</FormLabel>
                <FormControl>
                  <ApproverCheckboxList
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {form.formState.errors.root?.serverError && (
          <p className="text-sm font-medium text-destructive">
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
            {t('Turn on')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function defaultValuesFor(ownerId: string): TurnOnFormValues {
  return { requireApproval: true, approverIds: [ownerId] };
}

const TurnOnFormSchema = z
  .object({
    requireApproval: z.boolean(),
    approverIds: z
      .array(z.string())
      .max(20, 'You can choose up to 20 approvers'),
  })
  .refine(
    (values) => !values.requireApproval || values.approverIds.length > 0,
    { error: 'Choose at least one approver', path: ['approverIds'] },
  );

type TurnOnFormValues = z.infer<typeof TurnOnFormSchema>;
