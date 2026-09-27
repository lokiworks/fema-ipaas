import {
  RUN_MONITOR_MAX_WORKFLOW_ROWS,
  RunMonitorWorkflowRow,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DisabledReason } from '@/features/project-workspace/components/disabled-reason';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { runMonitorUtils, WorkflowSort } from '../utils/run-monitor-utils';

export function MonitorWorkflowTable({
  rows,
  truncated,
  fileName,
  onRowClick,
}: {
  rows: RunMonitorWorkflowRow[];
  truncated: boolean;
  fileName: string;
  onRowClick: (row: RunMonitorWorkflowRow) => void;
}) {
  const [sort, setSort] = useState<WorkflowSort>('runs');
  const sorted = runMonitorUtils.sortWorkflows({ rows, sort });

  const exportCsv = () => {
    const csv = runMonitorUtils.toCsv(
      runMonitorUtils.workflowCsvRows({
        rows: sorted,
        headers: [
          t('Workflow'),
          t('Project'),
          t('Run count'),
          t('Succeeded'),
          t('Failed'),
          t('Terminated'),
          t('Success rate'),
          t('Average duration (ms)'),
          t('P95 duration (ms)'),
          t('Last run'),
        ],
      }),
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(
      t('Exported data for {count} workflows', { count: sorted.length }),
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-medium">{t('Data details')}</h2>
          {truncated && (
            <span className="text-xs text-muted-foreground">
              {t('Showing the {count} workflows with the most runs', {
                count: RUN_MONITOR_MAX_WORKFLOW_ROWS,
              })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={sort}
            onValueChange={(value) =>
              setSort(value === 'failed' || value === 'rate' ? value : 'runs')
            }
          >
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="runs">{t('By run count')}</SelectItem>
              <SelectItem value="failed">{t('By failure count')}</SelectItem>
              <SelectItem value="rate">
                {t('By success rate (low to high)')}
              </SelectItem>
            </SelectContent>
          </Select>
          <DisabledReason
            reason={rows.length === 0 ? t('Nothing to export yet') : null}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rows.length === 0}
              onClick={exportCsv}
            >
              <Download className="size-4" />
              {t('Export CSV')}
            </Button>
          </DisabledReason>
        </div>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Workflow')}</TableHead>
              <TableHead className="w-32">{t('Project')}</TableHead>
              <TableHead className="w-28">{t('Trend')}</TableHead>
              <TableHead className="w-24 text-right">
                {t('Run count')}
              </TableHead>
              <TableHead className="w-20 text-right">{t('Failed')}</TableHead>
              <TableHead className="w-36">{t('Success rate')}</TableHead>
              <TableHead className="w-28 text-right">
                {t('Average duration')}
              </TableHead>
              <TableHead className="w-28 text-right">
                {t('P95 duration')}
              </TableHead>
              <TableHead className="w-36">{t('Last run')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => {
              const rate = runMonitorUtils.successRateOf(row);
              return (
                <TableRow
                  key={row.workflowId}
                  className="cursor-pointer"
                  onClick={() => onRowClick(row)}
                >
                  <TableCell className="max-w-0">
                    <TextWithTooltip tooltipMessage={row.workflowDisplayName}>
                      <p className="truncate font-medium">
                        {row.workflowDisplayName}
                      </p>
                    </TextWithTooltip>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <TextWithTooltip tooltipMessage={row.projectDisplayName}>
                      <p className="truncate text-muted-foreground">
                        {row.projectDisplayName}
                      </p>
                    </TextWithTooltip>
                  </TableCell>
                  <TableCell>
                    <Sparkline
                      values={row.trend}
                      danger={rate !== null && rate < LOW_SUCCESS_RATE}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUtils.formatNumber(row.runs)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      row.failed > 0 && 'text-destructive',
                    )}
                  >
                    {formatUtils.formatNumber(row.failed)}
                  </TableCell>
                  <TableCell>
                    {rate === null ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Progress
                          value={rate * 100}
                          className="h-1.5 w-16"
                          indicatorClassName={cn(
                            rate < LOW_SUCCESS_RATE
                              ? 'bg-destructive'
                              : 'bg-success',
                          )}
                        />
                        <span className="tabular-nums">
                          {runMonitorUtils.formatPercent(rate)}
                        </span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.avgDurationMs === null
                      ? '-'
                      : formatUtils.formatDuration(row.avgDurationMs, true)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.p95DurationMs === null
                      ? '-'
                      : formatUtils.formatDuration(row.p95DurationMs, true)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatUtils.formatDateToAgo(new Date(row.lastRunAt))}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">
                      {t('No runs in the selected range')}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t(
                        'Try a different time range, or clear the project and workflow filters.',
                      )}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function Sparkline({ values, danger }: { values: number[]; danger: boolean }) {
  const list = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const max = Math.max(1, ...list);
  const points = list
    .map((value, index) => {
      const x = (index / (list.length - 1)) * (SPARK_WIDTH - 2) + 1;
      const y = SPARK_HEIGHT - 2 - (value / max) * (SPARK_HEIGHT - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      aria-hidden="true"
      className={cn(danger ? 'text-destructive' : 'text-primary')}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

const LOW_SUCCESS_RATE = 0.9;
const SPARK_WIDTH = 90;
const SPARK_HEIGHT = 26;
