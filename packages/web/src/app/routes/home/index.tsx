import { ExecutionStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useMemo, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ConnectionHealthCard,
  FailingWorkflowsCard,
  OverviewStatCard,
  RecentlyEditedCard,
  RunTrendChart,
  TopConnectorsCard,
  overviewHooks,
} from '@/features/overview';

const FAILED_STATUSES: ExecutionStatus[] = [
  ExecutionStatus.FAILED,
  ExecutionStatus.INTERNAL_ERROR,
  ExecutionStatus.TIMEOUT,
  ExecutionStatus.MEMORY_LIMIT_EXCEEDED,
];

const PERIODS = [
  { value: '1', label: () => t('Last 24 hours') },
  { value: '7', label: () => t('Last 7 days') },
  { value: '30', label: () => t('Last 30 days') },
];

export function HomePage() {
  const [days, setDays] = useState('7');
  const { data, isLoading } = overviewHooks.useProjectOverview(Number(days));

  const summary = useMemo(() => {
    const counts = data?.countByStatus ?? [];
    const total = counts.reduce((sum, entry) => sum + entry.count, 0);
    const failed = counts
      .filter((entry) => FAILED_STATUSES.includes(entry.status))
      .reduce((sum, entry) => sum + entry.count, 0);
    const succeeded = counts
      .filter((entry) => entry.status === ExecutionStatus.SUCCEEDED)
      .reduce((sum, entry) => sum + entry.count, 0);
    const settled = succeeded + failed;
    return {
      total,
      failed,
      succeeded,
      successRate: settled === 0 ? null : (succeeded / settled) * 100,
    };
  }, [data]);

  const trend = useMemo(() => {
    const byDay = new Map<string, { succeeded: number; failed: number }>();
    for (const point of data?.dailyTrend ?? []) {
      const bucket = byDay.get(point.day) ?? { succeeded: 0, failed: 0 };
      if (point.status === ExecutionStatus.SUCCEEDED) {
        bucket.succeeded += point.count;
      } else if (FAILED_STATUSES.includes(point.status)) {
        bucket.failed += point.count;
      }
      byDay.set(point.day, bucket);
    }
    return buildContiguousTrend({ byDay, days: Number(days) });
  }, [data, days]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('Home')}</h1>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((period) => (
              <SelectItem key={period.value} value={period.value}>
                {period.label()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <OverviewStatCard
          label={t('Runs')}
          value={String(summary.total)}
          isLoading={isLoading}
        />
        <OverviewStatCard
          label={t('Success rate')}
          value={
            summary.successRate === null
              ? '—'
              : `${summary.successRate.toFixed(1)}%`
          }
          hint={
            summary.successRate === null ? t('No finished runs yet') : undefined
          }
          isLoading={isLoading}
        />
        <OverviewStatCard
          label={t('Failed runs')}
          value={String(summary.failed)}
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RunTrendChart trend={trend} isLoading={isLoading} />
        <FailingWorkflowsCard
          workflows={data?.topFailingWorkflows ?? []}
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ConnectionHealthCard
          health={data?.connectionHealth ?? []}
          isLoading={isLoading}
        />
        <TopConnectorsCard
          connectors={data?.topConnectors ?? []}
          isLoading={isLoading}
        />
        <RecentlyEditedCard
          workflows={data?.recentlyEditedWorkflows ?? []}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

function buildContiguousTrend({
  byDay,
  days,
}: {
  byDay: Map<string, DayCounts>;
  days: number;
}): TrendPoint[] {
  const totals = new Map<string, DayCounts>();
  for (const [isoDay, counts] of byDay) {
    const key = isoDay.slice(0, 10);
    const bucket = totals.get(key) ?? { succeeded: 0, failed: 0 };
    totals.set(key, {
      succeeded: bucket.succeeded + counts.succeeded,
      failed: bucket.failed + counts.failed,
    });
  }
  const now = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - (days - 1 - index),
      ),
    );
    const key = date.toISOString().slice(0, 10);
    return {
      day: date.toISOString(),
      ...(totals.get(key) ?? { succeeded: 0, failed: 0 }),
    };
  });
}

type DayCounts = { succeeded: number; failed: number };
type TrendPoint = DayCounts & { day: string };
