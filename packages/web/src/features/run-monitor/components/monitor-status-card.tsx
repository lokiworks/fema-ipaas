import { RunMonitorStats, RunMonitorStatusCount } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Cell, Pie, PieChart } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { executionUtils } from '@/features/executions/utils/execution-utils';
import { formatUtils } from '@/lib/format-utils';

import { runMonitorUtils } from '../utils/run-monitor-utils';

import { MONITOR_SERIES, monitorSeries } from './monitor-series';

export function MonitorStatusCard({
  stats,
  byStatus,
}: {
  stats: RunMonitorStats;
  byStatus: RunMonitorStatusCount[];
}) {
  const slices = [...MONITOR_SERIES].reverse().map((series) => ({
    ...series,
    name: series.key,
    value: stats[series.key],
    statuses: byStatus.filter((item) =>
      runMonitorUtils.statusesOf(series.group).includes(item.status),
    ),
  }));
  const shown = slices.filter((slice) => slice.value > 0);
  const config = slices.reduce<ChartConfig>(
    (acc, slice) => ({
      ...acc,
      [slice.key]: { label: monitorSeries.labelOf(slice), color: slice.color },
    }),
    {},
  );
  const rate = runMonitorUtils.formatPercent(
    runMonitorUtils.ratio({ part: stats.succeeded, total: stats.finished }),
  );
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">
          {t('Run status distribution')}
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          {t('{runs} runs in total', {
            runs: formatUtils.formatNumber(stats.runs),
          })}
        </span>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-6 pt-2">
        <div className="relative size-[152px] shrink-0">
          <ChartContainer
            config={config}
            className="aspect-square size-[152px]"
          >
            <PieChart>
              <ChartTooltip
                content={<ChartTooltipContent nameKey="name" hideLabel />}
              />
              <Pie
                data={
                  shown.length > 0
                    ? shown
                    : [{ key: 'empty', name: 'empty', value: 1 }]
                }
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={70}
                paddingAngle={shown.length > 1 ? 2 : 0}
                strokeWidth={0}
                isAnimationActive={false}
              >
                {shown.map((slice) => (
                  <Cell key={slice.key} fill={slice.color} />
                ))}
                {shown.length === 0 && (
                  <Cell key="empty" fill="hsl(var(--muted))" />
                )}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold tabular-nums">{rate}</span>
            <span className="text-xs text-muted-foreground">
              {t('Success rate')}
            </span>
          </div>
        </div>
        <div className="flex min-w-[180px] flex-1 flex-col gap-2">
          {slices.map((slice) => (
            <Tooltip key={slice.key}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 text-sm" tabIndex={0}>
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="grow">{monitorSeries.labelOf(slice)}</span>
                  <span className="font-medium tabular-nums">
                    {formatUtils.formatNumber(slice.value)}
                  </span>
                  <span className="w-14 text-right text-xs text-muted-foreground tabular-nums">
                    {runMonitorUtils.formatPercent(
                      runMonitorUtils.ratio({
                        part: slice.value,
                        total: stats.runs,
                      }),
                    )}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {slice.statuses.length === 0
                  ? t('No runs in the selected range')
                  : slice.statuses
                      .map(
                        (item) =>
                          `${executionUtils.getStatusLabel(
                            item.status,
                          )} ${formatUtils.formatNumber(item.count)}`,
                      )
                      .join(' · ')}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
