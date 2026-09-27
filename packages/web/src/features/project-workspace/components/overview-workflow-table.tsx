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
}: {
  context: WorkspaceContext;
  stats: ProjectOverviewStats | undefined;
}) {
  const navigate = useNavigate();
  const [promoteId, setPromoteId] = useState<string | null>(null);
  const { workflows, releasesEnabled, projectId, permissions } = context;
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Name')}</TableHead>
            {releasesEnabled ? (
              <>
                <TableHead className="w-28">{t('Test')}</TableHead>
                <TableHead className="w-28">{t('Production')}</TableHead>
              </>
            ) : (
              <TableHead className="w-24">{t('Status')}</TableHead>
            )}
            <TableHead className="w-32">{t('Last run')}</TableHead>
            <TableHead className="w-24 text-right">
              {t('Runs (7 days)')}
            </TableHead>
            <TableHead className="w-24 text-right">
              {t('Success rate')}
            </TableHead>
            {releasesEnabled && (
              <TableHead className="w-32">{t('Promotion')}</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {workflows.map((workflow) => {
            const item = statsById.get(workflow.id);
            const environment = context.environmentByWorkflow.get(workflow.id);
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
                <TableCell className="max-w-0">
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
                      <VersionCell number={item?.testVersionNumber ?? null} />
                    </TableCell>
                    <TableCell>
                      <VersionCell
                        number={item?.productionVersionNumber ?? null}
                        running={workflow.status === WorkflowStatus.ENABLED}
                      />
                    </TableCell>
                  </>
                ) : (
                  <TableCell>
                    <StatusBadge workflow={workflow} />
                  </TableCell>
                )}
                <TableCell>
                  <LastRun item={item} />
                </TableCell>
                <TableCell className="text-right">
                  {formatUtils.formatNumber(item?.runs7d ?? 0)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right',
                    rate !== null && rate < 90 && 'text-destructive',
                  )}
                >
                  {rate === null ? '—' : `${rate.toFixed(1)}%`}
                </TableCell>
                {releasesEnabled && (
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    {environment?.pendingReleaseId ? (
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

function VersionCell({
  number,
  running,
}: {
  number: number | null;
  running?: boolean;
}) {
  if (number === null) {
    return <span className="text-muted-foreground">{t('Not deployed')}</span>;
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
