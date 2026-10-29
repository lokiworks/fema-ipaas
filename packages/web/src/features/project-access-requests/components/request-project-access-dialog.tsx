import {
  CreateProjectAccessRequestBody,
  PROJECT_ACCESS_REASON_MAX_LENGTH,
} from '@fema-ipaas/shared';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';

import { projectAccessRequestsHooks } from '../hooks/project-access-requests-hooks';

export function RequestProjectAccessDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <RequestProjectAccessForm
          key={open ? 'open' : 'closed'}
          projectId={projectId}
          projectName={projectName}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function RequestProjectAccessForm({
  projectId,
  projectName,
  onOpenChange,
}: {
  projectId: string;
  projectName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate: submit, isPending } =
    projectAccessRequestsHooks.useRequestAccess();
  const form = useForm<CreateProjectAccessRequestBody>({
    resolver: zodResolver(CreateProjectAccessRequestBody),
    mode: 'onChange',
    defaultValues: requestDefaults(projectId),
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          submit(values, { onSuccess: () => onOpenChange(false) }),
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {t('projectAccessDialogTitle', { project: projectName })}
          </DialogTitle>
          <DialogDescription>
            {t('projectAccessDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Reason (optional)')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ''}
                  rows={3}
                  maxLength={PROJECT_ACCESS_REASON_MAX_LENGTH}
                  placeholder={t('projectAccessReasonPlaceholder')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('Submit request')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function requestDefaults(projectId: string): CreateProjectAccessRequestBody {
  return { projectId, reason: '' };
}
