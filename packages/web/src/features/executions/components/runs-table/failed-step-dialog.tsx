import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  Execution,
  ExecutionStatus,
  WorkflowTrigger,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { JsonViewer } from '@/components/custom/json-viewer';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { stepsHooks } from '@/features/connectors';
import { ConnectorIcon } from '@/features/connectors/components/connector-icon';
import { executionsApi } from '@/features/executions/api/executions-api';
import { executionUtils } from '@/features/executions/utils/execution-utils';
import { workflowHooks } from '@/features/workflows/hooks/workflow-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { formatUtils } from '@/lib/format-utils';

type FailedStepDialogProps = {
  run: Execution | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const FailedStepDialog = ({
  run,
  open,
  onOpenChange,
}: FailedStepDialogProps) => {
  const navigate = useNavigate();
  const failedStep = run?.failedStep;
  const isInternalError =
    run?.status === ExecutionStatus.INTERNAL_ERROR && isNil(failedStep);

  const { data: populatedWorkflow } = workflowHooks.useGetWorkflow({
    workflowId: run?.workflowId ?? '',
    versionId: run?.workflowVersionId,
    enabled: open && !isNil(run) && !isNil(failedStep),
  });

  const { data: populatedRun, isLoading: isLoadingInternalError } = useQuery({
    queryKey: ['execution-internal-error', run?.id],
    queryFn: () => executionsApi.getPopulated(run!.id),
    enabled: open && !isNil(run) && isInternalError,
  });

  if (isNil(run) || (isNil(failedStep) && !isInternalError)) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg" />
      </Dialog>
    );
  }

  if (isInternalError) {
    const internalError = populatedRun?.internalError;
    const workflowName = run.workflowVersion?.displayName ?? '';
    const failureTimestamp = run.finishTime ?? run.startTime ?? run.created;
    const { Icon: RunStatusIcon } = executionUtils.getStatusIcon(run.status);
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RunStatusIcon className="size-4 shrink-0 text-destructive-800 dark:text-destructive-200" />
              <span className="truncate">
                {workflowName || t('Internal error')}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {failureTimestamp
                ? formatUtils.formatDateWithTime(
                    new Date(failureTimestamp),
                    true,
                  )
                : null}
            </DialogDescription>
          </DialogHeader>
          {isLoadingInternalError ? (
            <Skeleton className="h-40 w-full rounded-md" />
          ) : internalError ? (
            <JsonViewer
              json={internalError.message}
              title={t('Internal error ({source})', {
                source: internalError.source,
              })}
              className="max-h-[400px] overflow-auto"
              hideDownload
            />
          ) : (
            <div className="text-sm italic text-muted-foreground">
              {t('No error details available')}
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() =>
                navigate(
                  authenticationSession.appendWorkspaceRoutePrefix(
                    `/runs/${run.id}`,
                  ),
                )
              }
            >
              <ArrowRight className="size-4" />
              {t('Go to run')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (isNil(failedStep)) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg" />
      </Dialog>
    );
  }

  const workflowVersion = populatedWorkflow?.version;
  const stepNode = workflowVersion
    ? workflowStructureUtil.getStep(failedStep.name, workflowVersion.trigger)
    : undefined;
  const stepNumber = workflowVersion
    ? workflowStructureUtil.getStepNumber(
        workflowVersion.trigger,
        failedStep.name,
      )
    : null;
  const workflowName =
    run.workflowVersion?.displayName ?? workflowVersion?.displayName ?? '';
  const failureTimestamp = run.finishTime ?? run.startTime ?? run.created;
  const { Icon: RunStatusIcon } = executionUtils.getStatusIcon(run.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <RunStatusIcon className="size-4 shrink-0 text-destructive-800 dark:text-destructive-200" />
            <span className="truncate">{workflowName || t('Run Failed')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {failureTimestamp
              ? formatUtils.formatDateWithTime(new Date(failureTimestamp), true)
              : null}
          </DialogDescription>
        </DialogHeader>
        {failedStep.message ? (
          <JsonViewer
            json={failedStep.message}
            title={
              <span className="flex items-center gap-2 min-w-0">
                {stepNode ? (
                  <StepIconBadge step={stepNode} />
                ) : (
                  <Skeleton className="size-[25px] rounded-md shrink-0" />
                )}
                <span className="truncate">
                  {stepNumber
                    ? `${stepNumber}. ${failedStep.displayName}`
                    : failedStep.displayName}
                </span>
              </span>
            }
            className="max-h-[400px] overflow-auto"
            hideDownload
          />
        ) : (
          <div className="text-sm italic text-muted-foreground">
            {t('No error message available')}
          </div>
        )}
        <DialogFooter>
          <Button
            onClick={() =>
              navigate(
                authenticationSession.appendWorkspaceRoutePrefix(
                  `/runs/${run.id}`,
                ),
              )
            }
          >
            <ArrowRight className="size-4" />
            {t('Go to run')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const StepIconBadge = ({
  step,
}: {
  step: WorkflowAction | WorkflowTrigger;
}) => {
  const { stepMetadata, isLoading } = stepsHooks.useStepMetadata({ step });
  if (isLoading || !stepMetadata) {
    return <Skeleton className="size-[25px] rounded-md shrink-0" />;
  }
  return (
    <ConnectorIcon
      logoUrl={stepMetadata.logoUrl}
      displayName={stepMetadata.displayName}
      size="xs"
      border={false}
      showTooltip={false}
    />
  );
};
