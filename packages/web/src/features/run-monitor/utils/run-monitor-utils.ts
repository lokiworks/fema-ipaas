import {
  DEFAULT_RUN_MONITOR_VIEW_CONFIG,
  ExecutionStatus,
  RunMonitorBucketUnit,
  RunMonitorMetric,
  RunMonitorOptions,
  RunMonitorRange,
  RunMonitorStatusGroup,
  RunMonitorViewConfig,
  RunMonitorWorkflowRow,
} from '@fema-ipaas/shared';

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function bucketLabel({
  start,
  unit,
  timezone,
}: {
  start: string;
  unit: RunMonitorBucketUnit;
  timezone: string;
}): string {
  const parts = partsOf({ instant: start, timezone });
  return unit === RunMonitorBucketUnit.DAY
    ? `${parts.month}/${parts.day}`
    : `${parts.hour}:${parts.minute}`;
}

function bucketTitle({
  start,
  end,
  unit,
  isLast,
  timezone,
  locale,
  nowLabel,
  todayLabel,
}: {
  start: string;
  end: string;
  unit: RunMonitorBucketUnit;
  isLast: boolean;
  timezone: string;
  locale: string;
  nowLabel: string;
  todayLabel: string;
}): string {
  const date = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  }).format(new Date(start));
  if (unit === RunMonitorBucketUnit.DAY) {
    return isLast ? `${date} (${todayLabel})` : date;
  }
  const from = bucketLabel({ start, unit, timezone });
  const to = isLast ? nowLabel : bucketLabel({ start: end, unit, timezone });
  const range = `${from} - ${to}`;
  return unit === RunMonitorBucketUnit.HOUR ? `${date} ${range}` : range;
}

function changePercent({
  current,
  previous,
}: {
  current: number;
  previous: number;
}): number | null {
  if (previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

function ratio({
  part,
  total,
}: {
  part: number;
  total: number;
}): number | null {
  return total > 0 ? part / total : null;
}

function formatPercent(value: number | null): string {
  return value === null ? '-' : `${(value * 100).toFixed(1)}%`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}%`;
}

function successRateOf(row: {
  succeeded: number;
  failed: number;
  terminated: number;
}): number | null {
  return ratio({
    part: row.succeeded,
    total: row.succeeded + row.failed + row.terminated,
  });
}

function sortWorkflows({
  rows,
  sort,
}: {
  rows: RunMonitorWorkflowRow[];
  sort: WorkflowSort;
}): RunMonitorWorkflowRow[] {
  return [...rows].sort((a, b) => {
    if (sort === 'failed') {
      return b.failed - a.failed || b.runs - a.runs;
    }
    if (sort === 'rate') {
      return (
        (successRateOf(a) ?? 2) - (successRateOf(b) ?? 2) || b.runs - a.runs
      );
    }
    return b.runs - a.runs;
  });
}

function toCsv(rows: (string | number)[][]): string {
  const escape = (value: string | number): string =>
    `"${String(value).replace(/"/g, '""')}"`;
  return `${CSV_BOM}${rows
    .map((cols) => cols.map(escape).join(','))
    .join('\r\n')}`;
}

function workflowCsvRows({
  rows,
  headers,
}: {
  rows: RunMonitorWorkflowRow[];
  headers: string[];
}): (string | number)[][] {
  return [
    headers,
    ...rows.map((row) => [
      row.workflowDisplayName,
      row.projectDisplayName,
      row.runs,
      row.succeeded,
      row.failed,
      row.terminated,
      formatPercent(successRateOf(row)),
      row.avgDurationMs ?? '',
      row.p95DurationMs ?? '',
      row.lastRunAt,
    ]),
  ];
}

function sanitizePrice(value: string): string {
  return value.replace(/[^\d.]/g, '').slice(0, MAX_PRICE_LENGTH);
}

function parsePrice(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : null;
}

function estimateCost({
  price,
  inputTokens,
  outputTokens,
}: {
  price: ModelPrice | undefined;
  inputTokens: number;
  outputTokens: number;
}): number | null {
  const input = parsePrice(price?.input);
  const output = parsePrice(price?.output);
  if (input === null || output === null) {
    return null;
  }
  return (
    (inputTokens / TOKENS_PER_PRICE_UNIT) * input +
    (outputTokens / TOKENS_PER_PRICE_UNIT) * output
  );
}

function totalCost(costs: (number | null)[]): number | null {
  if (costs.length === 0 || costs.some((cost) => cost === null)) {
    return null;
  }
  return costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0);
}

function formatCost(value: number | null): string {
  if (value === null) {
    return '-';
  }
  if (value > 0 && value < 0.01) {
    return '< 0.01';
  }
  return value.toFixed(2);
}

function readPrices(): ModelPrices {
  try {
    const raw = window.localStorage.getItem(PRICE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    return Object.entries(parsed).reduce<ModelPrices>(
      (acc, [model, value]) =>
        isModelPrice(value) ? { ...acc, [model]: value } : acc,
      {},
    );
  } catch {
    return {};
  }
}

function writePrices(prices: ModelPrices): void {
  try {
    window.localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify(prices));
  } catch {
    return;
  }
}

function pruneConfig({
  config,
  options,
}: {
  config: RunMonitorViewConfig;
  options: RunMonitorOptions | undefined;
}): RunMonitorViewConfig {
  if (!options) {
    return config;
  }
  const projectIds = config.projectIds.filter((id) =>
    options.projects.some((project) => project.id === id),
  );
  const workflowIds = config.workflowIds.filter((id) =>
    options.workflows.some(
      (workflow) =>
        workflow.id === id &&
        (projectIds.length === 0 || projectIds.includes(workflow.projectId)),
    ),
  );
  return { ...config, projectIds, workflowIds };
}

function sameConfig({
  a,
  b,
}: {
  a: RunMonitorViewConfig;
  b: RunMonitorViewConfig;
}): boolean {
  return signatureOf(a) === signatureOf(b);
}

function uniqueViewName({
  names,
  base,
}: {
  names: string[];
  base: string;
}): string {
  const index = Array.from({ length: names.length + 1 }, (_, i) => i + 1).find(
    (i) => !names.includes(`${base} ${i}`),
  );
  return `${base} ${index ?? names.length + 1}`;
}

function statusesOf(group: RunMonitorStatusGroup): ExecutionStatus[] {
  return STATUS_GROUPS[group];
}

function metricGroup(metric: RunMonitorMetric): RunMonitorStatusGroup | null {
  switch (metric) {
    case RunMonitorMetric.ALL:
      return null;
    case RunMonitorMetric.SUCCEEDED:
      return RunMonitorStatusGroup.SUCCEEDED;
    case RunMonitorMetric.FAILED:
      return RunMonitorStatusGroup.FAILED;
    case RunMonitorMetric.TERMINATED:
      return RunMonitorStatusGroup.TERMINATED;
  }
}

function logsLink({
  from,
  to,
  projectIds,
  workflowIds,
  group,
}: {
  from: string;
  to: string;
  projectIds: string[];
  workflowIds: string[];
  group: RunMonitorStatusGroup | null;
}): string {
  const params = new URLSearchParams();
  projectIds.forEach((id) => params.append('projectId', id));
  workflowIds.forEach((id) => params.append('workflowId', id));
  (group === null ? [] : statusesOf(group)).forEach((status) =>
    params.append('status', status),
  );
  params.set('createdAfter', from);
  params.set('createdBefore', to);
  return `/logs?${params.toString()}`;
}

function defaultConfig(): RunMonitorViewConfig {
  return { ...DEFAULT_RUN_MONITOR_VIEW_CONFIG };
}

function partsOf({
  instant,
  timezone,
}: {
  instant: string;
  timezone: string;
}): { month: string; day: string; hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const valueOf = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    month: valueOf('month'),
    day: valueOf('day'),
    hour: valueOf('hour').padStart(2, '0'),
    minute: valueOf('minute').padStart(2, '0'),
  };
}

function signatureOf(config: RunMonitorViewConfig): string {
  return JSON.stringify({
    ...config,
    projectIds: [...config.projectIds].sort(),
    workflowIds: [...config.workflowIds].sort(),
  });
}

function isModelPrice(value: unknown): value is ModelPrice {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record: Record<string, unknown> = { ...value };
  return typeof record.input === 'string' && typeof record.output === 'string';
}

const CSV_BOM = String.fromCharCode(0xfeff);
const TOKENS_PER_PRICE_UNIT = 1_000_000;
const MAX_PRICE_LENGTH = 10;
const PRICE_STORAGE_KEY = 'run-monitor:ai-prices';

const STATUS_GROUPS: Record<RunMonitorStatusGroup, ExecutionStatus[]> = {
  [RunMonitorStatusGroup.SUCCEEDED]: [ExecutionStatus.SUCCEEDED],
  [RunMonitorStatusGroup.FAILED]: [
    ExecutionStatus.FAILED,
    ExecutionStatus.INTERNAL_ERROR,
    ExecutionStatus.TIMEOUT,
    ExecutionStatus.MEMORY_LIMIT_EXCEEDED,
    ExecutionStatus.LOG_SIZE_EXCEEDED,
  ],
  [RunMonitorStatusGroup.TERMINATED]: [ExecutionStatus.CANCELED],
  [RunMonitorStatusGroup.RUNNING]: [
    ExecutionStatus.QUEUED,
    ExecutionStatus.RUNNING,
    ExecutionStatus.PAUSED,
  ],
};

export const runMonitorUtils = {
  browserTimezone,
  bucketLabel,
  bucketTitle,
  changePercent,
  ratio,
  formatPercent,
  formatSignedPercent,
  successRateOf,
  sortWorkflows,
  toCsv,
  workflowCsvRows,
  sanitizePrice,
  parsePrice,
  estimateCost,
  totalCost,
  formatCost,
  readPrices,
  writePrices,
  pruneConfig,
  sameConfig,
  uniqueViewName,
  statusesOf,
  metricGroup,
  logsLink,
  defaultConfig,
};

export const RUN_MONITOR_RANGES: RunMonitorRange[] = [
  RunMonitorRange.LAST_15_MINUTES,
  RunMonitorRange.LAST_HOUR,
  RunMonitorRange.LAST_24_HOURS,
  RunMonitorRange.LAST_7_DAYS,
  RunMonitorRange.LAST_30_DAYS,
];

export const RUN_MONITOR_DEFAULT_VIEW_ID = 'default';

export type WorkflowSort = 'runs' | 'failed' | 'rate';

export type ModelPrice = {
  input: string;
  output: string;
};

export type ModelPrices = Record<string, ModelPrice>;
