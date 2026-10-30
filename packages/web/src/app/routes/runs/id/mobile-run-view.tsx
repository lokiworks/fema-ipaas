import { isNil, Permission } from '@fema-ipaas/core-utils';
import {
  Execution,
  ExecutionStatus,
  PopulatedWorkflow,
  RunEnvironment,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Monitor, ScrollText } from 'lucide-react';
import { Link } from 'react-router-dom';

import { LoadingSpinner } from '@/components/custom/spinner';
import { useEmbedding } from '@/components/providers/embed-provider';
import { buttonVariants } from '@/components/ui/button';
import { executionUtils } from '@/features/executions';
import { RunLogNodeTrail } from '@/features/run-logs/components/run-log-node-trail';
import { runLogsHooks } from '@/features/run-logs/hooks/run-logs-hooks';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

export function MobileRunView({
  run,
  workflow,
}: {
  run: Execution;
  workflow: PopulatedWorkflow;
}) {
  const { embedState } = useEmbedding();
  const { checkAccess } = useAuthorization();
  const {
    data: detail,
    isLoading,
    isError,
  } = runLogsHooks.useDetail({
    runId: run.id,
  });
  const { variant, Icon } = executionUtils.getStatusIcon(run.status);
  const kind = runKindLabel({ run, workflow });
  const startedAt = run.startTime ?? run.created;
  const durationMs =
    isNil(run.startTime) || isNil(run.finishTime)
      ? null
      : new Date(run.finishTime).getTime() - new Date(run.startTime).getTime();
  const showNavigation = !embedState.disableNavigationInBuilder;

  return (
    <div className="bg-background flex h-full w-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="text-lg font-semibold break-words">
          {workflow.version.displayName}
        </h1>
        {!isNil(kind) && (
          <span className="text-muted-foreground w-fit rounded-full border px-2 py-0.5 text-[11px] leading-4">
            {kind}
          </span>
        )}
      </div>

      <div
        role="status"
        className={cn(
          'flex items-start gap-3 rounded-lg border p-3',
          variant === 'error' &&
            'border-destructive-200 bg-destructive-50 dark:border-destructive-800 dark:bg-destructive-950',
          variant === 'success' &&
            'border-success-200 bg-success-50 dark:border-success-800 dark:bg-success-950',
        )}
      >
        <Icon
          className={cn('mt-0.5 size-5 shrink-0', {
            'text-destructive': variant === 'error',
            'text-success': variant === 'success',
          })}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium">
            {statusTitle(run.status)}
          </span>
          <span className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
            <span>
              {t('Started')}{' '}
              {formatUtils.formatDateWithTime(new Date(startedAt), true)}
            </span>
            {!isNil(durationMs) && (
              <span>
                {t('Duration: {duration}', {
                  duration: formatUtils.formatDuration(durationMs, true),
                })}
              </span>
            )}
          </span>
          {!isNil(run.failedStep) && (
            <span className="text-destructive text-xs break-words">
              {t('Failed at node {name}', {
                name: run.failedStep.displayName,
              })}
            </span>
          )}
        </div>
      </div>

      <div className="bg-muted/50 flex items-start gap-3 rounded-lg border p-3">
        <Monitor className="text-muted-foreground mt-0.5 size-5 shrink-0" />
        <p className="text-muted-foreground min-w-0 text-sm">
          {t(
            'The canvas needs a wider screen. Open this run on a computer to see it on the canvas; here you can check each node and its input and output.',
          )}
        </p>
      </div>

      {showNavigation && checkAccess(Permission.READ_RUN) && (
        <Link
          className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
          to={`/projects/${run.projectId}/runs?workflowId=${run.workflowId}`}
        >
          <ScrollText />
          {t("View this workflow's run logs")}
        </Link>
      )}

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-semibold">{t('Step list')}</h2>
        {isError ? (
          <p className="text-muted-foreground text-sm">
            {t(
              'This log has no step data. The run may not have started yet, or its step data has passed the retention period.',
            )}
          </p>
        ) : isLoading || isNil(detail) ? (
          <div className="flex h-24 items-center">
            <LoadingSpinner />
          </div>
        ) : (
          <RunLogNodeTrail
            run={run}
            detail={detail}
            trigger={workflow.version.trigger}
          />
        )}
      </section>
    </div>
  );
}

function statusTitle(status: ExecutionStatus): string {
  switch (status) {
    case ExecutionStatus.SUCCEEDED:
      return t('Run Succeeded');
    case ExecutionStatus.FAILED:
      return t('Run Failed');
    default:
      return executionUtils.getStatusLabel(status);
  }
}

function runKindLabel({
  run,
  workflow,
}: {
  run: Execution;
  workflow: PopulatedWorkflow;
}): string | null {
  if (run.environment !== RunEnvironment.TESTING) {
    return null;
  }
  if (isNil(run.stepNameToTest)) {
    return t('Full debug');
  }
  return t('Step test · {step}', {
    step:
      workflowStructureUtil.getStep(
        run.stepNameToTest,
        workflow.version.trigger,
      )?.displayName ?? run.stepNameToTest,
  });
}
