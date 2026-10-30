import { ExecutionStatus, TenantMetricsStatusPoint } from '@fema-ipaas/shared';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { LineChart as LineChartIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUtils } from '@/lib/format-utils';

import { healthFormat } from '../lib/health-format';

const SERIES: Array<{ status: ExecutionStatus; label: string; color: string }> =
  [
    { status: ExecutionStatus.SUCCEEDED, label: 'Succeeded', color: '#22c55e' },
    { status: ExecutionStatus.FAILED, label: 'Failed', color: '#f59e0b' },
    {
      status: ExecutionStatus.INTERNAL_ERROR,
      label: 'Internal error',
      color: '#ef4444',
    },
    { status: ExecutionStatus.CANCELED, label: 'Canceled', color: '#9ca3af' },
  ];

type StatusLineChartProps = {
  data: TenantMetricsStatusPoint[] | undefined;
  isLoading: boolean;
  range: { createdAfter: string; createdBefore: string };
};

export function StatusLineChart({
  data,
  isLoading,
  range,
}: StatusLineChartProps) {
  const [selectedStatuses, setSelectedStatuses] = useState<ExecutionStatus[]>(
    SERIES.map((item) => item.status),
  );

  const selectedSeries = SERIES.filter((item) =>
    selectedStatuses.includes(item.status),
  );

  const toggleStatus = (status: ExecutionStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((item) => item !== status)
        : [...prev, status],
    );
  };

  const points = data ?? [];
  const chartData = useMemo(
    () =>
      statusChartRows({
        points: data ?? [],
        from: range.createdAfter,
        to: range.createdBefore,
        now: Date.now(),
      }),
    [data, range.createdAfter, range.createdBefore],
  );

  const chartConfig = selectedSeries.reduce((config, item) => {
    config[item.status] = { label: t(item.label), color: item.color };
    return config;
  }, {} as ChartConfig) satisfies ChartConfig;

  const hasSelection = selectedSeries.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">
          {t('Runs per day')}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          {SERIES.map((item) => (
            <label
              key={item.status}
              className="flex items-center gap-1.5 text-sm cursor-pointer select-none"
            >
              <Checkbox
                checked={selectedStatuses.includes(item.status)}
                onCheckedChange={() => toggleStatus(item.status)}
              />
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {t(item.label)}
            </label>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : !hasSelection ? (
          <div className="flex h-[300px] w-full flex-col items-center justify-center gap-2">
            <LineChartIcon className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t('Select at least one status to display')}
            </p>
          </div>
        ) : points.length === 0 ? (
          <div className="flex h-[300px] w-full flex-col items-center justify-center gap-2">
            <LineChartIcon className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t('No runs in this period')}
            </p>
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[300px] w-full"
          >
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
            >
              <defs>
                {selectedSeries.map((item) => (
                  <linearGradient
                    key={item.status}
                    id={`status-gradient-${item.status}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={item.color}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor={item.color}
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickFormatter={(value) =>
                  healthFormat.axisDayLabel(new Date(value))
                }
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                width={40}
                tickFormatter={(value) =>
                  formatUtils.formatNumberCompact(value as number)
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) =>
                      healthFormat.dayLabel(new Date(value))
                    }
                  />
                }
              />
              {selectedSeries.map((item) => (
                <Area
                  key={item.status}
                  dataKey={item.status}
                  type="monotone"
                  stroke={item.color}
                  strokeWidth={2}
                  fill={`url(#status-gradient-${item.status})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function statusChartRows({
  points,
  from,
  to,
  now,
}: {
  points: TenantMetricsStatusPoint[];
  from: string;
  to: string;
  now: number;
}): Record<string, string | number>[] {
  const counts = new Map(
    points.map((point) => [
      `${dayjs(point.day).format('YYYY-MM-DD')}|${point.status}`,
      point.count,
    ]),
  );
  const first = dayjs(from).startOf('day');
  const last = dayjs(Math.min(dayjs(to).valueOf(), now)).startOf('day');
  const dayCount = Math.max(last.diff(first, 'day') + 1, 1);
  return Array.from({ length: dayCount }, (_, index) => {
    const day = first.add(index, 'day');
    const key = day.format('YYYY-MM-DD');
    return SERIES.reduce<Record<string, string | number>>(
      (row, series) => ({
        ...row,
        [series.status]: counts.get(`${key}|${series.status}`) ?? 0,
      }),
      { date: day.toISOString() },
    );
  });
}
