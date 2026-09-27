import { isNil } from '@fema-ipaas/core-utils';
import {
  InstanceLimit,
  InstanceLimitKey,
  InstanceLimitSource,
  InstanceLimitUnit,
  LIMIT_USAGE_DANGER_RATIO,
  LIMIT_USAGE_WARNING_RATIO,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { z } from 'zod';

import { formatUtils } from '@/lib/format-utils';

function parseLimitInput(raw: string): ParsedLimitInput {
  const trimmed = raw.trim().replace(/[,，_\s]/g, '');
  if (trimmed.length === 0) {
    return { kind: 'inherit' };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { kind: 'invalid' };
  }
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0
    ? { kind: 'value', value }
    : { kind: 'invalid' };
}

function editFormSchema({
  workflowsCeiling,
  monthlyRunsCeiling,
  currentWorkflows,
}: EditFormBounds) {
  return z
    .object({
      workflowsLimit: z.string(),
      monthlyRunsLimit: z.string(),
    })
    .superRefine((values, ctx) => {
      const workflows = parseLimitInput(values.workflowsLimit);
      if (workflows.kind === 'invalid') {
        ctx.addIssue({
          code: 'custom',
          path: ['workflowsLimit'],
          message: 'positiveIntegerRequired',
        });
      } else if (workflows.kind === 'value') {
        if (workflows.value > workflowsCeiling) {
          ctx.addIssue({
            code: 'custom',
            path: ['workflowsLimit'],
            message: 'workflowsLimitAboveInstanceLimit',
          });
        } else if (workflows.value < currentWorkflows) {
          ctx.addIssue({
            code: 'custom',
            path: ['workflowsLimit'],
            message: 'workflowsLimitBelowCurrentCount',
          });
        }
      }
      const runs = parseLimitInput(values.monthlyRunsLimit);
      if (runs.kind === 'invalid') {
        ctx.addIssue({
          code: 'custom',
          path: ['monthlyRunsLimit'],
          message: 'positiveIntegerRequired',
        });
      } else if (runs.kind === 'value' && runs.value > monthlyRunsCeiling) {
        ctx.addIssue({
          code: 'custom',
          path: ['monthlyRunsLimit'],
          message: 'monthlyRunsLimitAboveInstanceLimit',
        });
      }
    });
}

function toRequestValue(raw: string): number | null {
  const parsed = parseLimitInput(raw);
  return parsed.kind === 'value' ? parsed.value : null;
}

function usageRatio({
  used,
  limit,
}: {
  used: number;
  limit: number | null;
}): number | null {
  if (isNil(limit) || limit <= 0) {
    return null;
  }
  return used / limit;
}

function usageTone(ratio: number | null): UsageTone {
  if (isNil(ratio)) {
    return 'normal';
  }
  if (ratio >= LIMIT_USAGE_DANGER_RATIO) {
    return 'danger';
  }
  if (ratio >= LIMIT_USAGE_WARNING_RATIO) {
    return 'warning';
  }
  return 'normal';
}

function toneIndicatorClass(tone: UsageTone): string | undefined {
  switch (tone) {
    case 'danger':
      return 'bg-destructive';
    case 'warning':
      return 'bg-amber-500';
    case 'normal':
      return undefined;
  }
}

function toneTextClass(tone: UsageTone): string | undefined {
  switch (tone) {
    case 'danger':
      return 'text-destructive';
    case 'warning':
      return 'text-amber-600';
    case 'normal':
      return undefined;
  }
}

function formatPercent(ratio: number | null): string {
  if (isNil(ratio)) {
    return '—';
  }
  const percent = ratio * 100;
  if (percent > 0 && percent < 0.1) {
    return '<0.1%';
  }
  return `${percent.toFixed(1)}%`;
}

function formatValue({
  unit,
  value,
}: {
  unit: InstanceLimitUnit;
  value: number | null;
}): string {
  if (isNil(value)) {
    return t('Unlimited');
  }
  switch (unit) {
    case InstanceLimitUnit.COUNT:
      return formatUtils.formatNumber(value);
    case InstanceLimitUnit.SECONDS:
      return formatSeconds(value);
    case InstanceLimitUnit.MEGABYTES:
      return `${formatUtils.formatNumber(value)} MB`;
    case InstanceLimitUnit.DAYS:
      return t('{count} days', { count: value });
  }
}

function formatSeconds(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) {
    return t('{count} hours', { count: seconds / 3600 });
  }
  if (seconds >= 60 && seconds % 60 === 0) {
    return t('{count} minutes', { count: seconds / 60 });
  }
  return t('{count} seconds', { count: seconds });
}

function limitLabel(key: InstanceLimitKey): string {
  switch (key) {
    case InstanceLimitKey.CONCURRENT_RUNS:
      return t('Concurrent runs');
    case InstanceLimitKey.RUNS_PER_MONTH:
      return t('Runs per month');
    case InstanceLimitKey.PROJECT_WORKFLOWS:
      return t('Workflows per project');
    case InstanceLimitKey.NODES_PER_RUN:
      return t('Steps per run');
    case InstanceLimitKey.RUN_TIMEOUT:
      return t('Run duration');
    case InstanceLimitKey.STEP_TIMEOUT:
      return t('Step duration');
    case InstanceLimitKey.STEP_PAYLOAD:
      return t('Step input and output size');
    case InstanceLimitKey.LOG_RETENTION:
      return t('Run log retention');
  }
}

function enforcementHint(key: InstanceLimitKey): string {
  switch (key) {
    case InstanceLimitKey.CONCURRENT_RUNS:
      return t(
        'Runs above the limit wait in the queue; debug runs are not counted.',
      );
    case InstanceLimitKey.RUNS_PER_MONTH:
      return t(
        'New runs above the limit are not started and are recorded as failed in the run log.',
      );
    case InstanceLimitKey.PROJECT_WORKFLOWS:
      return t(
        'Creating, importing or copying workflows beyond the limit is refused.',
      );
    case InstanceLimitKey.NODES_PER_RUN:
      return t(
        'A run that executes more steps than this is stopped as failed.',
      );
    case InstanceLimitKey.RUN_TIMEOUT:
      return t('A run that takes longer than this is stopped as timed out.');
    case InstanceLimitKey.STEP_TIMEOUT:
      return t('Applies to connector steps; a step that takes longer fails.');
    case InstanceLimitKey.STEP_PAYLOAD:
      return t('Applies to connector and code steps; a larger step fails.');
    case InstanceLimitKey.LOG_RETENTION:
      return t('Projects can only keep logs for a shorter time.');
  }
}

function sourceLabel(limit: InstanceLimit): string {
  switch (limit.source) {
    case InstanceLimitSource.ENV:
      return t('Set by {name}', { name: limit.envVar });
    case InstanceLimitSource.LEGACY_ENV:
      return t('Set by {name}', { name: limit.legacyEnvVar ?? limit.envVar });
    case InstanceLimitSource.INHERITED:
      return t('Follows {name} until {env} is set', {
        name: limit.inheritedFromEnvVar ?? '',
        env: limit.envVar,
      });
    case InstanceLimitSource.DEFAULT:
      return limit.key === InstanceLimitKey.CONCURRENT_RUNS
        ? t('Not enforced until {env} is set', { env: limit.envVar })
        : t('Default value');
  }
}

export const limitsUtils = {
  parseLimitInput,
  editFormSchema,
  toRequestValue,
  usageRatio,
  usageTone,
  toneIndicatorClass,
  toneTextClass,
  formatPercent,
  formatValue,
  limitLabel,
  enforcementHint,
  sourceLabel,
};

export type UsageTone = 'danger' | 'warning' | 'normal';

export type ParsedLimitInput =
  | { kind: 'inherit' }
  | { kind: 'invalid' }
  | { kind: 'value'; value: number };

export type EditFormBounds = {
  workflowsCeiling: number;
  monthlyRunsCeiling: number;
  currentWorkflows: number;
};

export type EditProjectLimitsForm = {
  workflowsLimit: string;
  monthlyRunsLimit: string;
};
