import {
  RunMonitorBucket,
  RunMonitorBucketUnit,
  RunMonitorChartMode,
  RunMonitorMetric,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatUtils } from '@/lib/format-utils';

import { runMonitorLabels } from '../utils/run-monitor-labels';
import { runMonitorUtils } from '../utils/run-monitor-utils';

import { MonitorSeries, monitorSeries } from './monitor-series';

export function MonitorTrendCard({
  buckets,
  unit,
  step,
  metric,
  chartMode,
  timezone,
  rangeLabel,
  onChartModeChange,
  onBucketClick,
}: {
  buckets: RunMonitorBucket[];
  unit: RunMonitorBucketUnit;
  step: number;
  metric: RunMonitorMetric;
  chartMode: RunMonitorChartMode;
  timezone: string;
  rangeLabel: string;
  onChartModeChange: (mode: RunMonitorChartMode) => void;
  onBucketClick: (bucket: RunMonitorBucket) => void;
}) {
  const { i18n } = useTranslation();
  const series = monitorSeries.seriesFor(metric);
  const rows = buckets.map((bucket, index) => ({
    ...bucket,
    label: runMonitorUtils.bucketLabel({ start: bucket.start, unit, timezone }),
    title: runMonitorUtils.bucketTitle({
      start: bucket.start,
      end: bucket.end,
      unit,
      isLast: index === buckets.length - 1,
      timezone,
      locale: i18n.language,
      nowLabel: t('now'),
      todayLabel: t('today'),
    }),
    total: series.reduce((sum, item) => sum + bucket[item.key], 0),
  }));
  const empty = rows.every((row) => row.total === 0);
  const config = series.reduce<ChartConfig>(
    (acc, item) => ({
      ...acc,
      [item.key]: { label: monitorSeries.labelOf(item), color: item.color },
    }),
    {},
  );
  const titleOf = (start: string): string =>
    rows.find((row) => row.start === start)?.title ?? start;
  const labelOfStart = (start: string): string =>
    rows.find((row) => row.start === start)?.label ?? start;
  const bucketByStart = (start: string | undefined) =>
    buckets.find((bucket) => bucket.start === start);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-base font-medium">
            {t('Run trend')}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {rangeLabel} · {runMonitorLabels.granularity({ unit, step })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Legend series={series} />
          <Tabs
            value={chartMode}
            onValueChange={(value) =>
              onChartModeChange(
                value === RunMonitorChartMode.TABLE
                  ? RunMonitorChartMode.TABLE
                  : RunMonitorChartMode.CHART,
              )
            }
          >
            <TabsList>
              <TabsTrigger value={RunMonitorChartMode.CHART}>
                {t('Chart view')}
              </TabsTrigger>
              <TabsTrigger value={RunMonitorChartMode.TABLE}>
                {t('Table view')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {chartMode === RunMonitorChartMode.TABLE ? (
          <div className="max-h-[260px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Time period')}</TableHead>
                  {series.map((item) => (
                    <TableHead key={item.key} className="text-right">
                      {monitorSeries.labelOf(item)}
                    </TableHead>
                  ))}
                  {series.length > 1 && (
                    <TableHead className="text-right">{t('Total')}</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows].reverse().map((row) => (
                  <TableRow
                    key={row.start}
                    className="cursor-pointer"
                    onClick={() => onBucketClick(row)}
                  >
                    <TableCell>{row.title}</TableCell>
                    {series.map((item) => (
                      <TableCell
                        key={item.key}
                        className="text-right tabular-nums"
                      >
                        {formatUtils.formatNumber(row[item.key])}
                      </TableCell>
                    ))}
                    {series.length > 1 && (
                      <TableCell className="text-right tabular-nums">
                        {formatUtils.formatNumber(row.total)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : empty ? (
          <div className="flex h-[260px] w-full flex-col items-start justify-center gap-2 px-4">
            <BarChart3 className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t('No runs in the selected range')}
            </p>
          </div>
        ) : (
          <ChartContainer
            config={config}
            className="aspect-auto h-[260px] w-full"
          >
            <BarChart
              accessibilityLayer
              data={rows}
              margin={{ left: 0, right: 8, top: 8 }}
              onClick={(state) => {
                const bucket = bucketByStart(state?.activeLabel);
                if (bucket) {
                  onBucketClick(bucket);
                }
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="start"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={16}
                tickFormatter={(value) => labelOfStart(String(value))}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <ChartTooltip
                cursor={{ fill: 'hsl(var(--muted))' }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => titleOf(String(value))}
                  />
                }
              />
              {series.map((item, index) => (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  stackId="runs"
                  fill={`var(--color-${item.key})`}
                  className="cursor-pointer"
                  radius={index === series.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={28}
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function Legend({ series }: { series: MonitorSeries[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {series.map((item) => (
        <span
          key={item.key}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {monitorSeries.labelOf(item)}
        </span>
      ))}
    </div>
  );
}
