import {
  CreateWorkflowReleaseRequestBody,
  WorkflowReleaseStatus,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

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
import { projectCollectionUtils } from '@/features/projects';
import { authenticationSession } from '@/lib/authentication-session';

import { releasesHooks } from '../hooks/releases-hooks';
import { releaseUiUtils } from '../utils/release-ui-utils';

export function ReleaseRequestDialog({
  open,
  onOpenChange,
  workflowId,
  onPromoted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  onPromoted?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <ReleaseRequestForm
          key={open ? 'open' : 'closed'}
          workflowId={workflowId}
          onPromoted={onPromoted}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReleaseRequestForm({
  workflowId,
  onPromoted,
  onOpenChange,
}: {
  workflowId: string;
  onPromoted?: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const projectId = authenticationSession.getProjectId()!;
  const { project } = projectCollectionUtils.useCurrentProject();
  const needsApproval = releaseUiUtils.approvalRequired(
    project.releaseApproverIds,
  );
  const { mutate: create, isPending } = releasesHooks.useCreateRelease();
  const form = useForm<CreateWorkflowReleaseRequestBody>({
    resolver: zodResolver(CreateWorkflowReleaseRequestBody),
    mode: 'onChange',
    defaultValues: { projectId, workflowId, note: '' },
  });

  const handleSubmit = (values: CreateWorkflowReleaseRequestBody) => {
    create(values, {
      onSuccess: (release) => {
        onOpenChange(false);
        if (release.status === WorkflowReleaseStatus.DEPLOYED) {
          toast.success(t('Promoted to production'));
          onPromoted?.();
          return;
        }
        toast.success(t('Promotion submitted for approval'));
        navigate(
          authenticationSession.appendProjectRoutePrefix(
            `/releases/${release.id}`,
          ),
        );
      },
    });
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <DialogHeader>
          <DialogTitle>{t('Promote to production')}</DialogTitle>
          <DialogDescription>
            {needsApproval
              ? t(
                  'The version in test is sent to the approvers with its checks and test runs. It goes live in production after approval.',
                )
              : t(
                  'The version in test goes live in production right away. This project does not require approval.',
                )}{' '}
            {t('Changes that are not deployed to test are not included.')}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('What changed')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  maxLength={300}
                  placeholder={t(
                    'e.g. Read the amount threshold from a variable; tested with 12 invoices',
                  )}
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
            {needsApproval
              ? t('Submit for approval')
              : t('Promote to production')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
