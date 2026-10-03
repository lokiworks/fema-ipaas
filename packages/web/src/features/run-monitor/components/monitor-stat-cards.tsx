import { RunMonitorMetric, RunMonitorStats } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { formatUtils } from '@/lib/format-utils';

import { runMonitorUtils } from '../utils/run-monitor-utils';

import { MonitorStatCard } from './monitor-stat-card';

export function MonitorStatCards({
  stats,
  metric,
  onMetricChange,
}: {
  stats: RunMonitorStats;
  metric: RunMonitorMetric;
  onMetricChange: (metric: RunMonitorMetric) => void;
}) {
  const change = runMonitorUtils.changePercent({
    current: stats.runs,
    previous: stats.previousRuns,
  });
  const share = (part: number): string =>
    runMonitorUtils.formatPercent(
      runMonitorUtils.ratio({ part, total: stats.runs }),
    );
  const toggle = (next: RunMonitorMetric) =>
    onMetricChange(
      metric === next && next !== RunMonitorMetric.ALL
        ? RunMonitorMetric.ALL
        : next,
    );
  const number = formatUtils.formatNumber;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <MonitorStatCard
        label={t('Run count')}
        value={number(stats.runs)}
        delta={
          change === null
            ? t('No runs in the previous period')
            : t('{change} vs previous period', {
                change: runMonitorUtils.formatSignedPercent(change),
              })
        }
        active={metric === RunMonitorMetric.ALL}
        onClick={() => toggle(RunMonitorMetric.ALL)}
      />
      <MonitorStatCard
        label={t('Succeeded')}
        value={number(stats.succeeded)}
        delta={t('Success rate {rate}', {
          rate: runMonitorUtils.formatPercent(
            runMonitorUtils.ratio({
              part: stats.succeeded,
              total: stats.finished,
            }),
          ),
        })}
        help={t(
          'Success rate = succeeded ÷ finished runs; running ones are not counted',
        )}
        active={metric === RunMonitorMetric.SUCCEEDED}
        onClick={() => toggle(RunMonitorMetric.SUCCEEDED)}
      />
      <MonitorStatCard
        label={t('Failed')}
        value={number(stats.failed)}
        delta={t('Share {rate}', { rate: share(stats.failed) })}
        tone={stats.failed > 0 ? 'danger' : undefined}
        help={t(
          'Includes failed, timed out, internal error, memory limit and log size limit runs',
        )}
        active={metric === RunMonitorMetric.FAILED}
        onClick={() => toggle(RunMonitorMetric.FAILED)}
      />
      <MonitorStatCard
        label={t('Terminated')}
        value={number(stats.terminated)}
        delta={t('Share {rate}', { rate: share(stats.terminated) })}
        help={t('Runs that were stopped by someone before they finished')}
        active={metric === RunMonitorMetric.TERMINATED}
        onClick={() => toggle(RunMonitorMetric.TERMINATED)}
      />
      <MonitorStatCard
        label={t('Running workflows')}
        value={number(stats.enabledWorkflows)}
        delta={t('{total} workflows · {active} executing now', {
          total: number(stats.workflowsInScope),
          active: number(stats.activeWorkflows),
        })}
        help={t(
          'Enabled workflows in scope. Executing now = workflows with a queued, running or waiting run at this moment.',
        )}
      />
      <MonitorStatCard
        label={t('Executed steps')}
        value={number(stats.executedSteps)}
        delta={
          stats.runs > 0
            ? t('{average} per run on average', {
                average: (stats.executedSteps / stats.runs).toFixed(1),
              })
            : t('No runs in the selected range')
        }
        help={t(
          'Sum of the steps each run executed in the selected range, counting the step a failed run stopped at. Steps whose failure was ignored or sent to a branch are not counted.',
        )}
      />
      <MonitorStatCard
        label={t('Peak concurrency')}
        value={number(stats.peakConcurrency)}
        delta={
          stats.peakAt
            ? t('At {time}', {
                time: formatUtils.formatDateWithTime(
                  new Date(stats.peakAt),
                  false,
                ),
              })
            : t('No runs in the selected range')
        }
        help={t(
          'Most runs executing at the same moment, from their start and finish times; unfinished runs count until now',
        )}
      />
    </div>
  );
}
