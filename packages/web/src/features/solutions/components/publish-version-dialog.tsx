import {
  formErrors,
  SOLUTION_SUMMARY_MAX_LENGTH,
  SolutionDetail,
  solutionUtils,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';

import { solutionsHooks } from '../hooks/solutions-hooks';

function PublishVersionDialog({
  solution,
  open,
  onOpenChange,
}: PublishVersionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <PublishVersionForm
          key={open ? 'open' : 'closed'}
          solution={solution}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function PublishVersionForm({ solution, onDone }: PublishVersionFormProps) {
  const form = useForm<PublishVersionFormValues>({
    resolver: zodResolver(PublishVersionFormSchema),
    mode: 'onChange',
    defaultValues: { notes: '' },
  });
  const { mutate: publish, isPending } = solutionsHooks.usePublishVersion({
    onSuccess: onDone,
  });
  const nextVersion = solutionUtils.nextVersion(solution.currentVersion);

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          publish({ id: solution.id, request: values }),
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {t('Publish v{version}', { version: nextVersion })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'The published workflows of the source project are packaged again. Projects that installed this solution will see an update.',
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('What changed in this version')}</FormLabel>
              <Textarea
                {...field}
                rows={3}
                maxLength={SOLUTION_SUMMARY_MAX_LENGTH}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('Publish')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const PublishVersionFormSchema = z.object({
  notes: z
    .string()
    .trim()
    .min(1, formErrors.required)
    .max(SOLUTION_SUMMARY_MAX_LENGTH, 'Notes are too long'),
});

export { PublishVersionDialog };

type PublishVersionFormValues = z.infer<typeof PublishVersionFormSchema>;

type PublishVersionDialogProps = {
  solution: SolutionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type PublishVersionFormProps = {
  solution: SolutionDetail;
  onDone: () => void;
};
