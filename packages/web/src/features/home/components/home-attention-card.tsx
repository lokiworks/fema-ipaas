import {
  ConnectionStatus,
  HomeBrokenConnection,
  HomeFailedRun,
  HomeRunStats,
  ProjectDirectoryItem,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CircleCheck, CircleX, Link2Off } from 'lucide-react';

import { formatUtils } from '@/lib/format-utils';

import { homeUtils } from '../utils/home-utils';

import { ProjectRunsLink } from './project-runs-link';
import { SideCard, SideRow } from './side-card';

export function HomeAttentionCard({
  failedRuns,
  brokenConnections,
  runs,
  projects,
  fallbackProjectId,
}: {
  failedRuns: HomeFailedRun[];
  brokenConnections: HomeBrokenConnection[];
  runs: HomeRunStats;
  projects: ProjectDirectoryItem[];
  fallbackProjectId: string | null;
}) {
  const groupedFailedRuns = homeUtils.groupFailedRuns({ runs: failedRuns });
  const truncated = runs.failedOrTimeout > failedRuns.length;
  const nothing = failedRuns.length === 0 && brokenConnections.length === 0;
  const failedTargets = runs.byProject
    .filter((row) => row.failedOrTimeout > 0)
    .map((row) => ({
      projectId: row.projectId,
      name:
        projects.find((project) => project.id === row.projectId)?.displayName ??
        row.projectId,
      count: row.failedOrTimeout,
    }));
  return (
    <SideCard
      title={t('Needs attention')}
      description={
        nothing
          ? t('All good')
          : t("Today's failed runs and unavailable connections")
      }
    >
      <div className="flex flex-col gap-0.5">
        {groupedFailedRuns.map(({ latest, count, timedOut }) => (
          <SideRow
            key={`${latest.workflowId}-${timedOut}`}
            icon={CircleX}
            iconClassName="text-destructive"
            title={
              timedOut
                ? t('{name} timed out', { name: latest.workflowDisplayName })
                : t('{name} failed', { name: latest.workflowDisplayName })
            }
            subtitle={
              count > 1
                ? t(
                    truncated
                      ? 'At least {count} times today, latest {time}'
                      : '{count} times today, latest {time}',
                    {
                      count,
                      time: formatUtils.formatDate(new Date(latest.created)),
                    },
                  )
                : formatUtils.formatDate(new Date(latest.created))
            }
            to={`/projects/${latest.projectId}/runs/${latest.id}`}
          />
        ))}
        {truncated && (
          <ProjectRunsLink
            targets={failedTargets}
            fallbackProjectId={fallbackProjectId}
            since={runs.since}
            failedOnly={true}
            className="self-start px-2 py-1 text-left text-xs text-primary hover:underline"
            title={t("View today's failed or timed out runs")}
          >
            {t('View all {count} failed or timed out runs today', {
              count: runs.failedOrTimeout,
            })}
          </ProjectRunsLink>
        )}
        {brokenConnections.map((connection) => (
          <SideRow
            key={connection.id}
            icon={Link2Off}
            iconClassName="text-warning"
            title={connection.displayName}
            subtitle={t('{reason}, {count} workflows affected', {
              reason: brokenReason(connection.status),
              count: connection.affectedWorkflowCount,
            })}
            to={`/projects/${
              connection.projectId
            }/connections?${new URLSearchParams({
              displayName: connection.displayName,
            }).toString()}`}
          />
        ))}
        {nothing && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-success" />
            {t('Nothing needs your attention')}
          </div>
        )}
      </div>
    </SideCard>
  );
}

function brokenReason(status: ConnectionStatus): string {
  switch (status) {
    case ConnectionStatus.EXPIRED:
      return t('Authorization expired');
    case ConnectionStatus.MISSING:
      return t('Not connected');
    case ConnectionStatus.ERROR:
    case ConnectionStatus.ACTIVE:
      return t('Connection error');
  }
}
