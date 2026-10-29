import {
  ExecutionStatus,
  ProjectOverviewStats,
  ProjectTreeWorkflow,
  ProjectWorkflowStats,
  WorkflowStatus,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Clock, Rocket } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { executionUtils } from '@/features/executions/utils/execution-utils';
import { ReleaseRequestDialog } from '@/features/releases/components/release-request-dialog';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { WorkspaceContext } from '../hooks/use-workspace-context';
import { workspaceUtils } from '../lib/workspace-utils';

export function OverviewWorkflowTable({
  context,
  stats,
  isLoading,
}: {
  context: WorkspaceContext;
  stats: ProjectOverviewStats | undefined;
  isLoading: boolean;
}) {
  const navigate = useNavigate();
  const [promoteId, setPromoteId] = useState<string | null>(null);
  const { workflows, releasesEnabled, projectId, permissions } = context;
  const statsPending = isLoading;
  const environmentsPending = context.environmentsLoading;
  const statsById = new Map<string, ProjectWorkflowStats>(
    (stats?.workflows ?? []).map((item) => [item.workflowId, item]),
  );
  return (
    <div className="flex min-w-0 flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{t('Workflows')}</span>
          <span className="text-xs text-muted-foreground">
            {releasesEnabled
              ? t(
                  'Versions running in test and production, and runs in the last 7 days (debug runs excluded)',
                )
              : t('Runs in the last 7 days, debug runs excluded')}
          </span>
        </div>
        {releasesEnabled && (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/releases`)}
          >
            {t('Releases and approvals')}
          </Button>
        )}
      </div>
      <ul
        className="flex flex-col divide-y sm:hidden"
        data-testid="overview-workflow-cards"
      >
        {workflows.map((workflow) => {
          const item = statsById.get(workflow.id);
          const rate = item
            ? workspaceUtils.successRate({
                succeeded: item.succeeded7d,
                failed: item.failed7d,
              })
            : null;
          return (
            <li key={workflow.id}>
              <button
                type="button"
                className="flex w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-muted/50"
                onClick={() =>
                  navigate(`/projects/${projectId}/workflows/${workflow.id}`)
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-medium"
                    title={workflow.displayName}
                  >
                    {workflow.displayName}
                  </span>
                  {releasesEnabled ? (
                    statsPending ? (
                      <CellSkeleton />
                    ) : (
                      <VersionCell
                        number={item?.productionVersionNumber ?? null}
                        running={workflow.status === WorkflowStatus.ENABLED}
                      />
                    )
                  ) : (
                    <StatusBadge workflow={workflow} />
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {statsPending ? (
                    <CellSkeleton />
                  ) : (
                    <>
                      <LastRun item={item} />
                      <span>
                        {t('{count} runs in 7 days', {
                          count: item?.runs7d ?? 0,
                        })}
                      </span>
                      {rate !== null && (
                        <span className={cn(rate < 90 && 'text-destructive')}>
                          {t('Success rate {rate}', {
                            rate: `${rate.toFixed(1)}%`,
                          })}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-44">{t('Name')}</TableHead>
              {releasesEnabled ? (
                <>
                  <TableHead className="w-24">
                    {t('Test environment')}
                  </TableHead>
                  <TableHead className="w-24">{t('Production')}</TableHead>
                </>
              ) : (
                <TableHead className="w-24">{t('Status')}</TableHead>
              )}
              <TableHead className="w-28">{t('Last run')}</TableHead>
              <TableHead className="w-20 whitespace-nowrap text-right">
                {t('Runs (7 days)')}
              </TableHead>
              <TableHead className="w-20 whitespace-nowrap text-right">
                {t('Success rate')}
              </TableHead>
              {releasesEnabled && (
                <TableHead className="w-28">{t('Promotion')}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {workflows.map((workflow) => {
              const item = statsById.get(workflow.id);
              const environment = context.environmentByWorkflow.get(
                workflow.id,
              );
              const rate = item
                ? workspaceUtils.successRate({
                    succeeded: item.succeeded7d,
                    failed: item.failed7d,
                  })
                : null;
              return (
                <TableRow
                  key={workflow.id}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate(`/projects/${projectId}/workflows/${workflow.id}`)
                  }
                >
                  <TableCell className="min-w-44 max-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate" title={workflow.displayName}>
                        {workflow.displayName}
                      </span>
                      {workflow.hasUnpublishedChanges && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                          </TooltipTrigger>
                          <TooltipContent>
                            {t('Has unpublished changes')}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </TableCell>
                  {releasesEnabled ? (
                    <>
                      <TableCell>
                        {statsPending ? (
                          <CellSkeleton />
                        ) : (
                          <VersionCell
                            number={item?.testVersionNumber ?? null}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {statsPending ? (
                          <CellSkeleton />
                        ) : (
                          <VersionCell
                            number={item?.productionVersionNumber ?? null}
                            running={workflow.status === WorkflowStatus.ENABLED}
                          />
                        )}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell>
                      <StatusBadge workflow={workflow} />
                    </TableCell>
                  )}
                  <TableCell>
                    {statsPending ? <CellSkeleton /> : <LastRun item={item} />}
                  </TableCell>
                  <TableCell className="text-right">
                    {statsPending ? (
                      <CellSkeleton className="ml-auto w-8" />
                    ) : (
                      formatUtils.formatNumber(item?.runs7d ?? 0)
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right',
                      rate !== null && rate < 90 && 'text-destructive',
                    )}
                  >
                    {statsPending ? (
                      <CellSkeleton className="ml-auto w-10" />
                    ) : rate === null ? (
                      '—'
                    ) : (
                      `${rate.toFixed(1)}%`
                    )}
                  </TableCell>
                  {releasesEnabled && (
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      {environmentsPending ? (
                        <CellSkeleton />
                      ) : environment?.pendingReleaseId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            navigate(
                              `/projects/${projectId}/releases/${environment.pendingReleaseId}`,
                            )
                          }
                        >
                          <Clock />
                          {t('Pending approval')}
                        </Button>
                      ) : environment?.testIsNewer && permissions.canPromote ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => setPromoteId(workflow.id)}
                        >
                          <Rocket />
                          {t('Promote')}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {promoteId && (
        <ReleaseRequestDialog
          open
          onOpenChange={(open) => !open && setPromoteId(null)}
          workflowId={promoteId}
        />
      )}
    </div>
  );
}

function CellSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-4 w-12', className)} />;
}

function VersionCell({
  number,
  running,
}: {
  number: number | null;
  running?: boolean;
}) {
  if (number === null) {
    return <span className="text-muted-foreground">{t('Not published')}</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          'size-1.5 rounded-full',
          running === false ? 'bg-muted-foreground' : 'bg-success',
        )}
      />
      v{number}
    </span>
  );
}

function StatusBadge({ workflow }: { workflow: ProjectTreeWorkflow }) {
  if (workflow.status === WorkflowStatus.ENABLED) {
    return <Badge variant="success">{t('Running')}</Badge>;
  }
  return (
    <Badge variant="outline">
      {workflow.published ? t('Stopped') : t('Unpublished')}
    </Badge>
  );
}

function LastRun({ item }: { item: ProjectWorkflowStats | undefined }) {
  if (!item?.lastRunAt || !item.lastRunStatus) {
    return <span className="text-muted-foreground">—</span>;
  }
  const { Icon, variant } = executionUtils.getStatusIcon(
    item.lastRunStatus ?? ExecutionStatus.SUCCEEDED,
  );
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Icon
        className={cn(
          'size-3.5',
          variant === 'success' && 'text-success',
          variant === 'error' && 'text-destructive',
        )}
      />
      {formatUtils.formatDateToAgo(new Date(item.lastRunAt))}
    </span>
  );
}
