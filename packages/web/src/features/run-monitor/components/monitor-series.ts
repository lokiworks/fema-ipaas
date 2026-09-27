import { RunMonitorMetric, RunMonitorStatusGroup } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { runMonitorUtils } from '../utils/run-monitor-utils';

function seriesFor(metric: RunMonitorMetric): MonitorSeries[] {
  const group = runMonitorUtils.metricGroup(metric);
  return group === null
    ? MONITOR_SERIES
    : MONITOR_SERIES.filter((series) => series.group === group);
}

function labelOf(series: MonitorSeries): string {
  return t(series.label);
}

export const monitorSeries = {
  seriesFor,
  labelOf,
};

export const MONITOR_SERIES: MonitorSeries[] = [
  {
    key: 'failed',
    group: RunMonitorStatusGroup.FAILED,
    label: 'Failed',
    color: 'hsl(var(--destructive))',
  },
  {
    key: 'terminated',
    group: RunMonitorStatusGroup.TERMINATED,
    label: 'Terminated',
    color: 'hsl(var(--light-blue))',
  },
  {
    key: 'running',
    group: RunMonitorStatusGroup.RUNNING,
    label: 'In progress',
    color: 'hsl(var(--primary))',
  },
  {
    key: 'succeeded',
    group: RunMonitorStatusGroup.SUCCEEDED,
    label: 'Succeeded',
    color: 'hsl(var(--success))',
  },
];

export type MonitorSeriesKey =
  | 'succeeded'
  | 'failed'
  | 'terminated'
  | 'running';

export type MonitorSeries = {
  key: MonitorSeriesKey;
  group: RunMonitorStatusGroup;
  label: string;
  color: string;
};
