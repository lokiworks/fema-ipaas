import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { projectCollectionUtils } from '@/features/projects';
import { releasesHooks } from '@/features/releases';
import { workflowsApi } from '@/features/workflows';
import { authenticationSession } from '@/lib/authentication-session';

import { useBuilderStateContext } from '../builder-hooks';

export function RollbackVersionDialog({
  versionId,
  versionNumber,
  onDone,
  children,
}: {
  versionId: string;
  versionNumber: number;
  onDone: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [workflow, setWorkflow, setVersion] = useBuilderStateContext(
    (state) => [state.workflow, state.setWorkflow, state.setVersion],
  );
  const { project } = projectCollectionUtils.useCurrentProject();
  const { mutateAsync: rollbackVersion } = releasesHooks.useRollback();
  const { mutate: rollback, isPending } = useMutation({
    mutationFn: async () => {
      const result = await rollbackVersion({
        projectId: authenticationSession.getProjectId()!,
        workflowId: workflow.id,
        versionId,
      });
      const updatedWorkflow = await workflowsApi.get(workflow.id);
      return { result, updatedWorkflow };
    },
    onSuccess: ({ result, updatedWorkflow }) => {
      setWorkflow(updatedWorkflow);
      setVersion(updatedWorkflow.version);
      setOpen(false);
      onDone();
      toast.success(
        t('Rolled back to version #{versionNumber}', { versionNumber }),
        {
          description:
            result.withdrawnReleases > 0
              ? t('withdrawnPromotionsCount', {
                  count: result.withdrawnReleases,
                })
              : undefined,
        },
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('Roll back to version #{versionNumber}?', { versionNumber })}
          </DialogTitle>
          <DialogDescription>
            {project.releasesEnabled
              ? t(
                  'The content of this version is published again as a new version and goes live in production right away, without test or approval.',
                )
              : t(
                  'The content of this version is published again as a new version and goes live right away.',
                )}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>{t('Your current draft is replaced with this version.')}</li>
          <li>{t('Pending promotions of this workflow are withdrawn.')}</li>
        </ul>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="button" loading={isPending} onClick={() => rollback()}>
            {t('Roll back')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
