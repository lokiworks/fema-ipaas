import { RollbackWorkflowRequestBody } from '@fema-ipaas/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <RollbackForm
          key={open ? 'open' : 'closed'}
          versionId={versionId}
          versionNumber={versionNumber}
          onClose={() => setOpen(false)}
          onDone={onDone}
        />
      </DialogContent>
    </Dialog>
  );
}

function RollbackForm({
  versionId,
  versionNumber,
  onClose,
  onDone,
}: {
  versionId: string;
  versionNumber: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [workflow, setWorkflow, setVersion, editLockHolder, editLockActions] =
    useBuilderStateContext((state) => [
      state.workflow,
      state.setWorkflow,
      state.setVersion,
      state.editLockHolder,
      state.editLockActions,
    ]);
  const { project } = projectCollectionUtils.useCurrentProject();
  const { mutateAsync: rollbackVersion } = releasesHooks.useRollback();
  const { mutate: rollback, isPending } = useMutation({
    mutationFn: async () => {
      const request: RollbackWorkflowRequestBody = {
        projectId: authenticationSession.getProjectId()!,
        workflowId: workflow.id,
        versionId,
        reason: reason.trim() || undefined,
      };
      const result = await rollbackVersion(request);
      const updatedWorkflow = await workflowsApi.get(workflow.id);
      return { result, updatedWorkflow };
    },
    onSuccess: ({ result, updatedWorkflow }) => {
      setWorkflow(updatedWorkflow);
      setVersion(updatedWorkflow.version);
      onClose();
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
    <>
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
      {editLockHolder && (
        <Alert variant="warning" data-testid="rollback-lock-warning">
          <Lock />
          <AlertTitle>
            {t('{name} is editing', { name: editLockHolder.userDisplayName })}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>
              {waiting
                ? t(
                    'Waiting for {name} to leave the editor. Rolling back is possible as soon as they do.',
                    { name: editLockHolder.userDisplayName },
                  )
                : editLockActions?.canTakeOver
                ? t(
                    'A rollback replaces the draft, so it cannot start while someone is editing. Notify them, wait, or take over editing as the project owner.',
                  )
                : t(
                    'A rollback replaces the draft, so it cannot start while someone is editing. Notify them or wait for them to finish.',
                  )}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => editLockActions?.requestEdit()}
              >
                {t('Notify {name}', { name: editLockHolder.userDisplayName })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={waiting}
                onClick={() => setWaiting(true)}
              >
                {waiting ? t('Waiting...') : t('Wait')}
              </Button>
              {editLockActions?.canTakeOver && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => editLockActions.takeOver()}
                >
                  {t('Take over editing')}
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
      {!editLockHolder && waiting && (
        <Alert variant="success" data-testid="rollback-lock-released">
          <AlertTitle>{t('The editor is free now')}</AlertTitle>
          <AlertDescription>
            {t('Nobody is editing this workflow, so you can roll back now.')}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="rollback-reason">{t('Reason (optional)')}</Label>
        <Textarea
          id="rollback-reason"
          value={reason}
          maxLength={300}
          placeholder={t('e.g. The new version sends duplicate messages')}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          loading={isPending}
          disabled={!!editLockHolder}
          onClick={() => rollback()}
        >
          {t('Roll back')}
        </Button>
      </DialogFooter>
    </>
  );
}
