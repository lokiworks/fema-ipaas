import { isNil } from '@fema-ipaas/core-utils';
import {
  ExecutionStatus,
  isExecutionStateTerminal,
  RunEnvironment,
  RunLogDetail,
  RunLogRow,
  RunLogType,
  RunRerunBlockReason,
  WorkflowRetryStrategy,
} from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  CircleStop,
  Info,
  Link2,
  RotateCcw,
  SkipForward,
  SquarePen,
  Workflow,
} from 'lucide-react';
import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { LoadingSpinner } from '@/components/custom/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { agentApprovalsHooks, ApprovalCard } from '@/features/agent-approvals';
import { workflowsApi } from '@/features/workflows/api/workflows-api';
import { formatUtils } from '@/lib/format-utils';

import { runLogsHooks } from '../hooks/run-logs-hooks';
import { runLogUiUtils } from '../utils/run-log-ui-utils';

import { RunLogNodeTrail } from './run-log-node-trail';
import { RunLogTerminateDialog } from './run-log-terminate-dialog';
import { RunStatus } from './run-status';

export function RunLogDrawer({
  runId,
  retentionDays,
  onClose,
  onOpenRun,
  onRerun,
}: {
  runId: string | null;
  retentionDays: number | null;
  onClose: () => void;
  onOpenRun: (runId: string) => void;
  onRerun: (request: {
    rows: RunLogRow[];
    strategy: WorkflowRetryStrategy;
  }) => void;
}) {
  const {
    data: detail,
    isLoading,
    isError,
  } = runLogsHooks.useDetail({
    runId,
  });
  return (
    <Sheet
      open={runId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-5xl">
        {isLoading && (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>{t('Run logs')}</SheetTitle>
              <SheetDescription>{t('Run logs')}</SheetDescription>
            </SheetHeader>
            <div className="flex h-40 items-center justify-center">
              <LoadingSpinner />
            </div>
          </>
        )}
        {isError && (
          <div className="p-6">
            <SheetHeader className="p-0">
              <SheetTitle>{t('Log not found')}</SheetTitle>
              <SheetDescription>
                {t(
                  'Run {runId} does not exist, you are not a member of its project, or it is older than the {days}-day retention period.',
                  { runId: runId ?? '', days: retentionDays ?? 0 },
                )}
              </SheetDescription>
            </SheetHeader>
          </div>
        )}
        {detail && (
          <DrawerBody
            key={detail.row.id}
            detail={detail}
            onOpenRun={onOpenRun}
            onRerun={onRerun}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  detail,
  onOpenRun,
  onRerun,
}: {
  detail: RunLogDetail;
  onOpenRun: (runId: string) => void;
  onRerun: (request: {
    rows: RunLogRow[];
    strategy: WorkflowRetryStrategy;
  }) => void;
}) {
  const row = detail.row;
  const [terminating, setTerminating] = useState(false);
  const live = !isExecutionStateTerminal({
    status: row.status,
    ignoreInternalError: false,
  });
  const { data: run } = runLogsHooks.useRunSteps({ runId: row.id, live });
  const { data: workflow } = useQuery({
    queryKey: [
      'run-log-workflow-version',
      row.workflowId,
      row.workflowVersionId,
    ],
    queryFn: () =>
      workflowsApi.get(row.workflowId, { versionId: row.workflowVersionId }),
    enabled: row.workflowExists,
    staleTime: Infinity,
    retry: false,
  });
  const { data: approvals } = agentApprovalsHooks.useApprovals({
    query: { projectId: row.projectId, executionId: row.id },
    enabled: row.status === ExecutionStatus.PAUSED,
    primary: false,
  });
  const terminate = runLogsHooks.useTerminate({
    onDone: () => setTerminating(false),
  });
  const workflowName = row.workflowExists
    ? row.workflowDisplayName ?? row.workflowId
    : t('Deleted workflow');
  const otherReruns = detail.reruns.filter((rerun) => rerun.id !== row.id);
  const latestRerun = otherReruns[0];
  const copyLink = () => {
    const url = `${window.location.origin}/logs?${new URLSearchParams({
      run: row.id,
    }).toString()}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(t('Log link copied')))
      .catch(() =>
        toast.error(t('Copy failed. Copy the link from the address bar.')),
      );
  };
  const terminateBlocked = detail.canTerminate
    ? null
    : row.environment !== RunEnvironment.PRODUCTION
    ? t('Debug runs stop on their own and cannot be terminated here')
    : row.status === ExecutionStatus.RUNNING
    ? t('Only queued or waiting runs can be terminated')
    : t('You only have view access to this project');

  return (
    <div className="flex flex-col gap-4 p-6">
      <SheetHeader className="gap-2 p-0 pr-8">
        <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="text-muted-foreground">
            {formatUtils.formatDateWithTime(new Date(row.created), false)}
          </span>
          <span className="text-muted-foreground">|</span>
          <span className="min-w-0 truncate">{workflowName}</span>
          <Badge variant="outline">
            {row.type === RunLogType.DEBUG ? t('Debug') : t('Run')}
          </Badge>
          <Badge
            variant={
              row.environment === RunEnvironment.PRODUCTION ? 'outline' : 'info'
            }
          >
            {row.environment === RunEnvironment.PRODUCTION
              ? t('Production')
              : t('Test')}
          </Badge>
        </SheetTitle>
        <SheetDescription asChild>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <RunStatus status={row.status} />
            <span>
              {t('Duration: {duration}', {
                duration: isNil(row.durationMs)
                  ? '-'
                  : formatUtils.formatDuration(row.durationMs, true),
              })}
            </span>
            {!isNil(row.rerunOfExecutionId) && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => onOpenRun(row.rerunOfExecutionId ?? '')}
              >
                {t('View original log')}
              </Button>
            )}
            {row.inPlaceRetryCount > 0 && (
              <span>
                {t(
                  '{count, plural, =1 {Rerun from the failed step once in place} other {Rerun from the failed step # times in place}}',
                  { count: row.inPlaceRetryCount },
                )}
              </span>
            )}
            {isNil(row.rerunOfExecutionId) && latestRerun && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => onOpenRun(latestRerun.id)}
              >
                {t(
                  '{count, plural, =1 {Rerun once, view the latest} other {Rerun # times, view the latest}}',
                  { count: otherReruns.length },
                )}
              </Button>
            )}
            {detail.issue && (
              <Link
                className="underline"
                to={`/projects/${row.projectId}/issues/${detail.issue.id}`}
              >
                {t('Issue ({count} failures)', {
                  count: detail.issue.occurrences,
                })}
              </Link>
            )}
            <RunInfo detail={detail} />
          </div>
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-wrap items-center gap-2">
        {row.rerunBlockReason !== RunRerunBlockReason.NOT_FAILED && (
          <>
            <ActionWithReason
              reason={row.fromFailedStepBlockReason ?? null}
              label={t('Rerun from the failed step')}
              icon={<SkipForward className="size-4" />}
              variant="default"
              onClick={() =>
                onRerun({
                  rows: [row],
                  strategy: WorkflowRetryStrategy.FROM_FAILED_STEP,
                })
              }
            />
            <ActionWithReason
              reason={row.rerunBlockReason ?? null}
              label={t('Rerun the whole run')}
              icon={<RotateCcw className="size-4" />}
              variant="outline"
              onClick={() =>
                onRerun({
                  rows: [row],
                  strategy: WorkflowRetryStrategy.ON_LATEST_VERSION,
                })
              }
            />
          </>
        )}
        {live && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!detail.canTerminate}
                  onClick={() => setTerminating(true)}
                >
                  <CircleStop className="size-4" />
                  {t('Terminate run')}
                </Button>
              </span>
            </TooltipTrigger>
            {terminateBlocked && (
              <TooltipContent className="max-w-64">
                {terminateBlocked}
              </TooltipContent>
            )}
          </Tooltip>
        )}
        <Button type="button" size="sm" variant="outline" onClick={copyLink}>
          <Link2 className="size-4" />
          {t('Copy link')}
        </Button>
        {row.workflowExists && (
          <Button type="button" size="sm" variant="outline" asChild>
            <Link to={`/projects/${row.projectId}/workflows/${row.workflowId}`}>
              <SquarePen className="size-4" />
              {t('Open workflow')}
            </Link>
          </Button>
        )}
      </div>

      {(approvals ?? []).length > 0 && (
        <div className="flex flex-col gap-2">
          {(approvals ?? []).map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              showRunLink={false}
            />
          ))}
          <Link
            className="text-xs underline"
            to={`/projects/${row.projectId}/agent-approvals`}
          >
            {t('View all agent approvals in this project')}
          </Link>
        </div>
      )}

      <div className="flex items-center gap-2 border-b pb-2">
        <span className="text-sm font-medium">{t('Step list')}</span>
        <Button type="button" size="sm" variant="ghost" asChild>
          <Link to={`/projects/${row.projectId}/runs/${row.id}`}>
            <Workflow className="size-4" />
            {t('Workflow canvas')}
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          {row.type === RunLogType.DEBUG
            ? t('Showing the draft used for this debug run')
            : isNil(row.versionNumber)
            ? t('Showing the version used by this run')
            : t('Showing version v{version} used by this run', {
                version: row.versionNumber,
              })}
        </span>
      </div>
      {run ? (
        <RunLogNodeTrail
          run={run}
          detail={detail}
          trigger={workflow?.version.trigger}
        />
      ) : (
        <div className="flex h-24 items-center">
          <LoadingSpinner />
        </div>
      )}
      <RunLogTerminateDialog
        open={terminating}
        childRunCount={detail.cancellableChildRuns}
        pending={terminate.isPending}
        onOpenChange={setTerminating}
        onConfirm={(request) => terminate.mutate({ id: row.id, request })}
      />
    </div>
  );
}

function ActionWithReason({
  reason,
  label,
  icon,
  variant,
  onClick,
}: {
  reason: RunRerunBlockReason | null;
  label: string;
  icon: ReactNode;
  variant: 'default' | 'outline';
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button
            type="button"
            size="sm"
            variant={variant}
            disabled={reason !== null}
            onClick={onClick}
          >
            {icon}
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      {reason !== null && (
        <TooltipContent className="max-w-64">
          {runLogUiUtils.blockReasonLabel(reason)}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

function RunInfo({ detail }: { detail: RunLogDetail }) {
  const row = detail.row;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto gap-1 p-0"
        >
          <Info className="size-3.5" />
          {t('Run info')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 text-sm">
        <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">{t('Run ID')}</dt>
          <dd className="break-all font-mono text-xs">{row.id}</dd>
          <dt className="text-muted-foreground">{t('Started')}</dt>
          <dd>
            {isNil(row.startTime)
              ? '-'
              : formatUtils.formatDateWithTime(new Date(row.startTime), true)}
          </dd>
          <dt className="text-muted-foreground">{t('Finished')}</dt>
          <dd>
            {isNil(row.finishTime)
              ? '-'
              : formatUtils.formatDateWithTime(new Date(row.finishTime), true)}
          </dd>
          <dt className="text-muted-foreground">{t('Triggered by')}</dt>
          <dd>{triggerText(row)}</dd>
          <dt className="text-muted-foreground">{t('Project')}</dt>
          <dd>{row.projectDisplayName}</dd>
          <dt className="text-muted-foreground">{t('Environment')}</dt>
          <dd>
            {row.environment === RunEnvironment.PRODUCTION
              ? t('Production')
              : t('Test')}
          </dd>
          <dt className="text-muted-foreground">{t('Version')}</dt>
          <dd>
            {row.type === RunLogType.DEBUG
              ? t('Draft (debug)')
              : isNil(row.versionNumber)
              ? '-'
              : `v${row.versionNumber}`}
          </dd>
          {!isNil(row.businessKey) && (
            <>
              <dt className="text-muted-foreground">{t('Business key')}</dt>
              <dd className="flex flex-col gap-1">
                <span className="break-all font-mono text-xs">
                  {row.businessKey}
                </span>
                <Link
                  className="text-xs text-primary hover:underline"
                  to={`/projects/${
                    row.projectId
                  }/runs?businessKey=${encodeURIComponent(
                    row.businessKey,
                  )}&time=30d`}
                >
                  {t('All logs of this record')}
                </Link>
              </dd>
            </>
          )}
          {!isNil(detail.dedupeKey) && (
            <>
              <dt className="text-muted-foreground">{t('Dedupe key')}</dt>
              <dd className="break-all font-mono text-xs">
                {detail.dedupeKey}
              </dd>
            </>
          )}
          {!isNil(row.parentRunId) && (
            <>
              <dt className="text-muted-foreground">{t('Parent run')}</dt>
              <dd className="break-all font-mono text-xs">{row.parentRunId}</dd>
            </>
          )}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

function triggerText(row: RunLogRow): string {
  if (!isNil(row.rerunOfExecutionId)) {
    return t('Rerun of an earlier log');
  }
  if (!isNil(row.parentRunId)) {
    return t('Called by a parent workflow');
  }
  if (!isNil(row.triggeredBy)) {
    return row.type === RunLogType.DEBUG
      ? t('Debug run started by a user')
      : t('Started manually by a user');
  }
  return t('Started by the trigger');
}
