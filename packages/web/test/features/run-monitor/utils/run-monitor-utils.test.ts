import {
  ExecutionStatus,
  RunMonitorBucketUnit,
  RunMonitorChartMode,
  RunMonitorMetric,
  RunMonitorRange,
  RunMonitorStatusGroup,
  RunMonitorViewConfig,
  RunMonitorWorkflowRow,
  WorkflowStatus,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { runMonitorUtils } from '@/features/run-monitor/utils/run-monitor-utils';

const row = (
  overrides: Partial<RunMonitorWorkflowRow>,
): RunMonitorWorkflowRow => ({
  workflowId: 'wf1',
  workflowDisplayName: '报销同步',
  projectId: 'p1',
  projectDisplayName: '财务',
  runs: 10,
  succeeded: 8,
  failed: 1,
  terminated: 1,
  running: 0,
  avgDurationMs: 1200,
  p95DurationMs: 3000,
  lastRunAt: '2026-09-27T02:00:00.000Z',
  trend: [1, 2],
  ...overrides,
});

describe('runMonitorUtils.bucketLabel / bucketTitle', () => {
  it('formats day buckets as month/day in the given timezone', () => {
    expect(
      runMonitorUtils.bucketLabel({
        start: '2026-09-26T16:00:00.000Z',
        unit: RunMonitorBucketUnit.DAY,
        timezone: 'Asia/Shanghai',
      }),
    ).toBe('9/27');
  });

  it('formats minute buckets as HH:mm', () => {
    expect(
      runMonitorUtils.bucketLabel({
        start: '2026-09-27T01:05:00.000Z',
        unit: RunMonitorBucketUnit.MINUTE,
        timezone: 'Asia/Shanghai',
      }),
    ).toBe('09:05');
  });

  it('ends the last bucket at now', () => {
    expect(
      runMonitorUtils.bucketTitle({
        start: '2026-09-27T01:00:00.000Z',
        end: '2026-09-27T01:37:00.000Z',
        unit: RunMonitorBucketUnit.MINUTE,
        isLast: true,
        timezone: 'UTC',
        locale: 'en',
        nowLabel: 'now',
        todayLabel: 'today',
      }),
    ).toBe('01:00 - now');
  });

  it('prefixes hour buckets with the date', () => {
    expect(
      runMonitorUtils.bucketTitle({
        start: '2026-09-27T01:00:00.000Z',
        end: '2026-09-27T02:00:00.000Z',
        unit: RunMonitorBucketUnit.HOUR,
        isLast: false,
        timezone: 'UTC',
        locale: 'en',
        nowLabel: 'now',
        todayLabel: 'today',
      }),
    ).toBe('Sep 27 01:00 - 02:00');
  });

  it('marks today on the last day bucket', () => {
    expect(
      runMonitorUtils.bucketTitle({
        start: '2026-09-27T00:00:00.000Z',
        end: '2026-09-27T05:00:00.000Z',
        unit: RunMonitorBucketUnit.DAY,
        isLast: true,
        timezone: 'UTC',
        locale: 'en',
        nowLabel: 'now',
        todayLabel: 'today',
      }),
    ).toBe('Sep 27 (today)');
  });
});

describe('runMonitorUtils rates', () => {
  it('returns null change when the previous period had no runs', () => {
    expect(runMonitorUtils.changePercent({ current: 5, previous: 0 })).toBe(
      null,
    );
    expect(runMonitorUtils.changePercent({ current: 15, previous: 10 })).toBe(
      50,
    );
  });

  it('formats percentages and signed changes', () => {
    expect(runMonitorUtils.formatPercent(null)).toBe('-');
    expect(runMonitorUtils.formatPercent(0.8766)).toBe('87.7%');
    expect(runMonitorUtils.formatSignedPercent(-12.345)).toBe('-12.3%');
    expect(runMonitorUtils.formatSignedPercent(0)).toBe('+0.0%');
  });

  it('computes success rate over finished runs only', () => {
    expect(
      runMonitorUtils.successRateOf({ succeeded: 3, failed: 1, terminated: 0 }),
    ).toBe(0.75);
    expect(
      runMonitorUtils.successRateOf({ succeeded: 0, failed: 0, terminated: 0 }),
    ).toBe(null);
  });
});

describe('runMonitorUtils.sortWorkflows', () => {
  const rows = [
    row({ workflowId: 'a', runs: 5, failed: 0, succeeded: 5, terminated: 0 }),
    row({ workflowId: 'b', runs: 9, failed: 4, succeeded: 5, terminated: 0 }),
    row({ workflowId: 'c', runs: 1, failed: 0, succeeded: 0, terminated: 0 }),
  ];

  it('sorts by runs, failures or ascending success rate', () => {
    expect(
      runMonitorUtils
        .sortWorkflows({ rows, sort: 'runs' })
        .map((r) => r.workflowId),
    ).toEqual(['b', 'a', 'c']);
    expect(
      runMonitorUtils
        .sortWorkflows({ rows, sort: 'failed' })
        .map((r) => r.workflowId),
    ).toEqual(['b', 'a', 'c']);
    expect(
      runMonitorUtils
        .sortWorkflows({ rows, sort: 'rate' })
        .map((r) => r.workflowId),
    ).toEqual(['b', 'a', 'c']);
  });
});

describe('runMonitorUtils CSV', () => {
  it('quotes values, escapes quotes and starts with a BOM', () => {
    const csv = runMonitorUtils.toCsv([
      ['name', 'count'],
      ['say "hi"', 3],
    ]);
    expect(csv).toBe('\uFEFF"name","count"\r\n"say ""hi""","3"');
  });

  it('builds one line per workflow after the header', () => {
    const lines = runMonitorUtils.workflowCsvRows({
      rows: [row({ avgDurationMs: null })],
      headers: ['h1'],
    });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toEqual([
      '报销同步',
      '财务',
      10,
      8,
      1,
      1,
      '80.0%',
      '',
      3000,
      '2026-09-27T02:00:00.000Z',
    ]);
  });
});

describe('runMonitorUtils cost estimation', () => {
  it('needs both prices to estimate', () => {
    expect(
      runMonitorUtils.estimateCost({
        price: { input: '10', output: '' },
        inputTokens: 1_000_000,
        outputTokens: 0,
      }),
    ).toBe(null);
    expect(
      runMonitorUtils.estimateCost({
        price: undefined,
        inputTokens: 1,
        outputTokens: 1,
      }),
    ).toBe(null);
  });

  it('prices input and output per million tokens', () => {
    expect(
      runMonitorUtils.estimateCost({
        price: { input: '10', output: '30' },
        inputTokens: 500_000,
        outputTokens: 100_000,
      }),
    ).toBeCloseTo(8);
  });

  it('only totals when every model has a price', () => {
    expect(runMonitorUtils.totalCost([1, null])).toBe(null);
    expect(runMonitorUtils.totalCost([])).toBe(null);
    expect(runMonitorUtils.totalCost([1.5, 2])).toBe(3.5);
  });

  it('sanitizes and formats prices', () => {
    expect(runMonitorUtils.sanitizePrice('1a2.5元')).toBe('12.5');
    expect(runMonitorUtils.parsePrice('1.')).toBe(null);
    expect(runMonitorUtils.formatCost(0.004)).toBe('< 0.01');
    expect(runMonitorUtils.formatCost(null)).toBe('-');
    expect(runMonitorUtils.formatCost(12.345)).toBe('12.35');
  });
});

describe('runMonitorUtils views', () => {
  const config: RunMonitorViewConfig = {
    range: RunMonitorRange.LAST_24_HOURS,
    projectIds: ['p1', 'gone'],
    workflowIds: ['w1', 'w2', 'gone'],
    metric: RunMonitorMetric.FAILED,
    chartMode: RunMonitorChartMode.TABLE,
  };
  const options = {
    projects: [
      { id: 'p1', displayName: '财务' },
      { id: 'p2', displayName: '人事' },
    ],
    workflows: [
      {
        id: 'w1',
        projectId: 'p1',
        displayName: 'a',
        status: WorkflowStatus.ENABLED,
      },
      {
        id: 'w2',
        projectId: 'p2',
        displayName: 'b',
        status: WorkflowStatus.ENABLED,
      },
    ],
  };

  it('drops projects and workflows the user can no longer see', () => {
    const pruned = runMonitorUtils.pruneConfig({ config, options });
    expect(pruned.projectIds).toEqual(['p1']);
    expect(pruned.workflowIds).toEqual(['w1']);
  });

  it('compares configs regardless of id order', () => {
    expect(
      runMonitorUtils.sameConfig({
        a: { ...config, projectIds: ['a', 'b'] },
        b: { ...config, projectIds: ['b', 'a'] },
      }),
    ).toBe(true);
    expect(
      runMonitorUtils.sameConfig({
        a: config,
        b: { ...config, metric: RunMonitorMetric.ALL },
      }),
    ).toBe(false);
  });

  it('picks the first free numbered name', () => {
    expect(
      runMonitorUtils.uniqueViewName({
        names: ['默认视图', '我的视图 1'],
        base: '我的视图',
      }),
    ).toBe('我的视图 2');
  });
});

describe('runMonitorUtils.logsLink', () => {
  it('passes filters and the status group to the run logs page', () => {
    const link = runMonitorUtils.logsLink({
      from: '2026-09-27T00:00:00.000Z',
      to: '2026-09-27T01:00:00.000Z',
      projectIds: ['p1'],
      workflowIds: [],
      group: RunMonitorStatusGroup.TERMINATED,
    });
    const params = new URLSearchParams(link.split('?')[1]);
    expect(link.startsWith('/logs?')).toBe(true);
    expect(params.getAll('projectId')).toEqual(['p1']);
    expect(params.getAll('status')).toEqual([ExecutionStatus.CANCELED]);
    expect(params.get('createdAfter')).toBe('2026-09-27T00:00:00.000Z');
    expect(params.get('createdBefore')).toBe('2026-09-27T01:00:00.000Z');
  });

  it('maps metrics to status groups', () => {
    expect(runMonitorUtils.metricGroup(RunMonitorMetric.ALL)).toBe(null);
    expect(runMonitorUtils.statusesOf(RunMonitorStatusGroup.FAILED)).toContain(
      ExecutionStatus.TIMEOUT,
    );
  });
});
