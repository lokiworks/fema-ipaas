import {
  ProjectOverviewStats,
  ProjectTreeWorkflow,
  WorkflowStatus,
} from '@fema-ipaas/shared';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { CircleCheck, CircleX, Play, Workflow } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { WorkspaceContext } from '../hooks/use-workspace-context';
import { runsLinks } from '../lib/runs-links';
import { workspaceUtils } from '../lib/workspace-utils';

export function OverviewStatCards({
  context,
  stats,
  isLoading,
}: {
  context: WorkspaceContext;
  stats: ProjectOverviewStats | undefined;
  isLoading: boolean;
}) {
  const navigate = useNavigate();
  const { workflows, releasesEnabled, environments, projectId } = context;
  const runs = stats?.runs;
  const rate = runs
    ? workspaceUtils.successRate({
        succeeded: runs.succeeded7d,
        failed: runs.failed7d,
      })
    : null;
  const change = runs
    ? workspaceUtils.changePercent({
        current: runs.last7d,
        previous: runs.previous7d,
      })
    : null;
  const since = dayjs().subtract(7, 'day').toISOString();
  const allRunsLink = runsLinks.forProject({ projectId, createdAfter: since });
  const failedLink = runsLinks.forProject({
    projectId,
    createdAfter: since,
    failedOnly: true,
  });
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label={t('Workflows')}
        icon={Workflow}
        value={String(workflows.length)}
        hint={workflowHint({ workflows, releasesEnabled, environments })}
      />
      <StatCard
        label={t('Runs in the last 7 days')}
        icon={Play}
        isLoading={isLoading}
        value={formatUtils.formatNumber(runs?.last7d ?? 0)}
        hint={
          change === null
            ? t('No runs in the previous 7 days')
            : t('{change} vs the previous 7 days', {
                change: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
              })
        }
        onClick={() => navigate(allRunsLink)}
      />
      <StatCard
        label={t('Success rate (7 days)')}
        icon={CircleCheck}
        isLoading={isLoading}
        value={rate === null ? '—' : `${rate.toFixed(1)}%`}
        danger={rate !== null && rate < 90}
        hint={
          runs && runs.succeeded7d + runs.failed7d > 0
            ? t('{succeeded} succeeded · {failed} failed or timed out', {
                succeeded: runs.succeeded7d,
                failed: runs.failed7d,
              })
            : t('No finished runs yet')
        }
        onClick={() => navigate(allRunsLink)}
      />
      <StatCard
        label={t('Failures (7 days)')}
        icon={CircleX}
        isLoading={isLoading}
        value={formatUtils.formatNumber(runs?.failed7d ?? 0)}
        danger={(runs?.failed7d ?? 0) > 0}
        hint={
          (runs?.failed7d ?? 0) > 0
            ? t('Click to see the failed runs')
            : t('No failed or timed out runs')
        }
        onClick={() => navigate(failedLink)}
      />
    </div>
  );
}

function workflowHint({
  workflows,
  releasesEnabled,
  environments,
}: {
  workflows: ProjectTreeWorkflow[];
  releasesEnabled: boolean;
  environments: WorkspaceContext['environments'];
}): string {
  if (releasesEnabled && environments) {
    const toPromote = environments.workflows.filter(
      (item) => item.testIsNewer && !item.pendingReleaseId,
    ).length;
    return [
      t('{count} running in production', {
        count: environments.production.running,
      }),
      toPromote > 0 ? t('{count} to promote', { count: toPromote }) : '',
      environments.production.pendingApproval > 0
        ? t('{count} pending approval', {
            count: environments.production.pendingApproval,
          })
        : '',
    ]
      .filter((part) => part.length > 0)
      .join(' · ');
  }
  const running = workflows.filter(
    (workflow) => workflow.status === WorkflowStatus.ENABLED,
  ).length;
  const unpublished = workflows.filter(
    (workflow) => workflow.hasUnpublishedChanges,
  ).length;
  return t('{running} running · {unpublished} with unpublished changes', {
    running,
    unpublished,
  });
}

function StatCard({
  label,
  icon: Icon,
  value,
  hint,
  danger,
  isLoading,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  hint: string;
  danger?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </span>
      {isLoading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <span
          className={cn('text-2xl font-semibold', danger && 'text-destructive')}
        >
          {value}
        </span>
      )}
      <span className="truncate text-xs text-muted-foreground">{hint}</span>
    </>
  );
  const className =
    'flex min-w-0 flex-col items-start gap-1 rounded-lg border bg-card p-4 text-left';
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(className, 'transition-colors hover:bg-muted/50')}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}
