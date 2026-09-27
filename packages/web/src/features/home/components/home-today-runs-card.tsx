import { HomeRunStats, ProjectDirectoryItem } from '@fema-ipaas/shared';
import { t } from 'i18next';
import React from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { homeUtils } from '../utils/home-utils';

import { HourlySparkline } from './hourly-sparkline';
import { ProjectRunsLink, ProjectRunsTarget } from './project-runs-link';
import { SideCard } from './side-card';

export function HomeTodayRunsCard({
  runs,
  projects,
  fallbackProjectId,
  now,
}: {
  runs: HomeRunStats | undefined;
  projects: ProjectDirectoryItem[];
  fallbackProjectId: string | null;
  now: Date;
}) {
  if (!runs) {
    return (
      <SideCard title={t('Runs today')}>
        <Skeleton className="h-20 w-full" />
      </SideCard>
    );
  }
  const rate = homeUtils.successRate(runs);
  const allTargets = targetsFor({ runs, projects, failedOnly: false });
  const failedTargets = targetsFor({ runs, projects, failedOnly: true });
  return (
    <SideCard
      title={t('Runs today')}
      description={t('Since midnight, excluding test runs')}
    >
      <div className="grid grid-cols-3 gap-1">
        <ProjectRunsLink
          targets={allTargets}
          fallbackProjectId={fallbackProjectId}
          since={runs.since}
          failedOnly={false}
          className={STAT_CLASS}
          title={t("View today's runs")}
        >
          <Stat value={runs.total.toLocaleString()} label={t('Runs')} />
        </ProjectRunsLink>
        <ProjectRunsLink
          targets={failedTargets}
          fallbackProjectId={fallbackProjectId}
          since={runs.since}
          failedOnly={true}
          className={STAT_CLASS}
          title={t("View today's failed or timed out runs")}
        >
          <Stat
            value={runs.failedOrTimeout.toLocaleString()}
            label={t('Failed or timed out')}
            valueClassName={cn(runs.failedOrTimeout > 0 && 'text-destructive')}
          />
        </ProjectRunsLink>
        <ProjectRunsLink
          targets={allTargets}
          fallbackProjectId={fallbackProjectId}
          since={runs.since}
          failedOnly={false}
          className={STAT_CLASS}
          title={t('Successful runs divided by finished runs')}
        >
          <Stat value={homeUtils.formatRate(rate)} label={t('Success rate')} />
        </ProjectRunsLink>
      </div>
      <HourlySparkline
        values={homeUtils.visibleHourly({
          hourly: runs.hourly,
          since: new Date(runs.since),
          now,
        })}
      />
    </SideCard>
  );
}

function Stat({
  value,
  label,
  valueClassName,
}: {
  value: React.ReactNode;
  label: string;
  valueClassName?: string;
}) {
  return (
    <>
      <span className={cn('text-xl font-semibold', valueClassName)}>
        {value}
      </span>
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {label}
      </span>
    </>
  );
}

function targetsFor({
  runs,
  projects,
  failedOnly,
}: {
  runs: HomeRunStats;
  projects: ProjectDirectoryItem[];
  failedOnly: boolean;
}): ProjectRunsTarget[] {
  return runs.byProject
    .map((row) => ({
      projectId: row.projectId,
      name:
        projects.find((project) => project.id === row.projectId)?.displayName ??
        row.projectId,
      count: failedOnly ? row.failedOrTimeout : row.total,
    }))
    .filter((target) => target.count > 0);
}

const STAT_CLASS =
  'flex flex-col items-start rounded-md px-2 py-1 text-left hover:bg-muted';
