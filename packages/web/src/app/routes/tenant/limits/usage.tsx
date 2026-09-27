import {
  AlertTriggerEvent,
  CAPACITY_ALERT_THRESHOLDS,
  InstanceLimit,
  InstanceLimitKey,
  InstanceLimitUnit,
  ProjectLimitsRow,
} from '@fema-ipaas/shared';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { BellRing } from 'lucide-react';
import { Link } from 'react-router-dom';

import { CenteredPage } from '@/app/components/centered-page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { alertsHooks } from '@/features/alerts';
import { limitsHooks, limitsUtils } from '@/features/limits';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

export default function UsageLimitsPage() {
  const { data: instance, isLoading } = limitsHooks.useInstanceLimits();
  const { data: projects } = limitsHooks.useProjectLimits();
  const rows = projects?.data ?? [];

  return (
    <CenteredPage
      widthClassName="max-w-5xl"
      title={t('Usage and limits')}
      description={t(
        'Instance limits come from the deployment configuration; project limits are adjusted in Projects and limits. Run counts exclude debug runs.',
      )}
    >
      {isLoading || !instance ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <MonthlyRunsCard
              used={instance.runsThisMonth}
              limit={
                instance.limits.find(
                  (limit) => limit.key === InstanceLimitKey.RUNS_PER_MONTH,
                )?.value ?? null
              }
              monthStart={instance.monthStart}
              monthEnd={instance.monthEnd}
            />
            <CapacityAlertCard rows={rows} />
          </div>
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-medium">{t('Instance limits')}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {instance.limits.map((limit) => (
                <InstanceLimitCard key={limit.key} limit={limit} />
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-medium">{t('By project')}</h2>
              <span className="text-xs text-muted-foreground">
                {t('Shares are based on runs this month')}
              </span>
            </div>
            <ProjectUsageTable
              rows={rows}
              total={instance.runsThisMonth}
              deletedRuns={projects?.runsInDeletedProjects ?? 0}
            />
          </section>
        </div>
      )}
    </CenteredPage>
  );
}

function MonthlyRunsCard({
  used,
  limit,
  monthStart,
  monthEnd,
}: {
  used: number;
  limit: number | null;
  monthStart: string;
  monthEnd: string;
}) {
  const start = dayjs(monthStart);
  const end = dayjs(monthEnd);
  const daysInMonth = end.diff(start, 'day') + 1;
  const elapsedDays = Math.min(
    daysInMonth,
    Math.max(1, dayjs().diff(start, 'day') + 1),
  );
  const projected = Math.round((used / elapsedDays) * daysInMonth);
  const ratio = limitsUtils.usageRatio({ used, limit });
  const tone = limitsUtils.usageTone(ratio);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <span className="text-xs text-muted-foreground">
          {t('Runs this month ({from} – {to})', {
            from: formatUtils.formatDateOnly(start.toDate()),
            to: formatUtils.formatDateOnly(end.toDate()),
          })}
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">
            {formatUtils.formatNumber(used)}
          </span>
          <span className="text-sm text-muted-foreground">
            {`/ ${limitsUtils.formatValue({
              unit: InstanceLimitUnit.COUNT,
              value: limit,
            })}`}
          </span>
        </div>
        <Progress
          className="h-2"
          value={Math.min(100, (ratio ?? 0) * 100)}
          indicatorClassName={limitsUtils.toneIndicatorClass(tone)}
        />
        <span className="text-xs text-muted-foreground">
          {t(
            '{percent} used, {elapsed} of {days} days passed, about {projected} runs expected this month at the current pace',
            {
              percent: limitsUtils.formatPercent(ratio),
              elapsed: elapsedDays,
              days: daysInMonth,
              projected: formatUtils.formatNumber(projected),
            },
          )}
        </span>
      </CardContent>
    </Card>
  );
}

function CapacityAlertCard({ rows }: { rows: ProjectLimitsRow[] }) {
  const { data: policies } = alertsHooks.usePolicies();
  const capacityPolicies = (policies ?? []).filter(
    (policy) =>
      policy.enabled && policy.events.includes(AlertTriggerEvent.CAPACITY),
  );
  const thresholds = capacityPolicies
    .map((policy) => policy.capacityThresholdPercent)
    .filter((value): value is number => value !== null);
  const lowestThreshold =
    thresholds.length > 0
      ? Math.min(...thresholds)
      : Math.min(...CAPACITY_ALERT_THRESHOLDS);
  const over = rows
    .map((row) => ({
      row,
      ratio: limitsUtils.usageRatio({
        used: row.monthlyRuns.used,
        limit: row.monthlyRuns.limit,
      }),
    }))
    .filter(
      (entry) => entry.ratio !== null && entry.ratio * 100 >= lowestThreshold,
    );
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-center gap-2">
          <BellRing className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('Capacity alerts')}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {capacityPolicies.length > 0
            ? t(
                '{count} alert policies notify once per project per month when runs this month reach {thresholds} of the project limit.',
                {
                  count: capacityPolicies.length,
                  thresholds: thresholds.map((value) => `${value}%`).join('、'),
                },
              )
            : t(
                'No alert policy covers capacity yet, so projects reaching {threshold} of their limit are only listed here.',
                { threshold: `${lowestThreshold}%` },
              )}
        </span>
        <span className="text-xs">
          {over.length > 0
            ? t('Reached the threshold: {projects}', {
                projects: over
                  .map(
                    (entry) =>
                      `${entry.row.displayName} ${limitsUtils.formatPercent(
                        entry.ratio,
                      )}`,
                  )
                  .join('、'),
              })
            : t('No project has reached the threshold')}
        </span>
        <Button variant="outline" size="sm" className="self-start" asChild>
          <Link to="/tenant/alerts">
            {capacityPolicies.length > 0
              ? t('Manage alert policies')
              : t('Set up a capacity alert')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function InstanceLimitCard({ limit }: { limit: InstanceLimit }) {
  const ratio =
    limit.usage === null
      ? null
      : limitsUtils.usageRatio({ used: limit.usage, limit: limit.value });
  const tone = limitsUtils.usageTone(ratio);
  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-2 pt-4">
        <span className="text-xs text-muted-foreground">
          {limitsUtils.limitLabel(limit.key)}
        </span>
        <span className="text-lg font-semibold tabular-nums">
          {limit.usage === null
            ? limitsUtils.formatValue({ unit: limit.unit, value: limit.value })
            : `${formatUtils.formatNumber(
                limit.usage,
              )} / ${limitsUtils.formatValue({
                unit: limit.unit,
                value: limit.value,
              })}`}
        </span>
        {ratio !== null && (
          <Progress
            className="h-1.5"
            value={Math.min(100, ratio * 100)}
            indicatorClassName={limitsUtils.toneIndicatorClass(tone)}
          />
        )}
        <span className="text-xs text-muted-foreground">
          {limitsUtils.enforcementHint(limit.key)}
        </span>
        <div className="mt-auto flex flex-col gap-0.5 pt-1">
          <code className="text-xs">{limit.envVar}</code>
          <span className="text-xs text-muted-foreground">
            {limitsUtils.sourceLabel(limit)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectUsageTable({
  rows,
  total,
  deletedRuns,
}: {
  rows: ProjectLimitsRow[];
  total: number;
  deletedRuns: number;
}) {
  const sorted = [...rows].sort(
    (a, b) => b.monthlyRuns.used - a.monthlyRuns.used,
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('Project')}</TableHead>
          <TableHead className="text-right">{t('Runs this month')}</TableHead>
          <TableHead className="text-right">{t('Success rate')}</TableHead>
          <TableHead>{t('Share')}</TableHead>
          <TableHead>{t('Project limit used')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => {
          const finished = row.succeededThisMonth + row.failedThisMonth;
          const ratio = limitsUtils.usageRatio({
            used: row.monthlyRuns.used,
            limit: row.monthlyRuns.limit,
          });
          const tone = limitsUtils.usageTone(ratio);
          const share = total > 0 ? row.monthlyRuns.used / total : 0;
          return (
            <TableRow key={row.projectId}>
              <TableCell className="font-medium">{row.displayName}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatUtils.formatNumber(row.monthlyRuns.used)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {finished === 0
                  ? '—'
                  : limitsUtils.formatPercent(
                      row.succeededThisMonth / finished,
                    )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress className="h-1.5 w-28" value={share * 100} />
                  <span className="text-xs tabular-nums">
                    {limitsUtils.formatPercent(share)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress
                    className="h-1.5 w-24"
                    value={Math.min(100, (ratio ?? 0) * 100)}
                    indicatorClassName={limitsUtils.toneIndicatorClass(tone)}
                  />
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      limitsUtils.toneTextClass(tone),
                    )}
                  >
                    {`${limitsUtils.formatPercent(ratio)} · ${
                      row.monthlyRuns.limit === null
                        ? '—'
                        : formatUtils.formatNumber(row.monthlyRuns.limit)
                    }`}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
        {deletedRuns > 0 && (
          <TableRow>
            <TableCell className="text-muted-foreground">
              {t('Deleted projects')}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatUtils.formatNumber(deletedRuns)}
            </TableCell>
            <TableCell className="text-right">—</TableCell>
            <TableCell>
              <span className="text-xs tabular-nums">
                {limitsUtils.formatPercent(total > 0 ? deletedRuns / total : 0)}
              </span>
            </TableCell>
            <TableCell>—</TableCell>
          </TableRow>
        )}
        {sorted.length === 0 && deletedRuns === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-sm text-muted-foreground">
              {t('No projects yet')}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
