import {
  InstanceLimit,
  InstanceLimitKey,
  InstanceLimitSource,
  InstanceLimitUnit,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { limitsUtils } from '@/features/limits/utils/limits-utils';

describe('limitsUtils.parseLimitInput', () => {
  it('treats an empty value as following the instance limit', () => {
    expect(limitsUtils.parseLimitInput('  ')).toEqual({ kind: 'inherit' });
  });

  it('accepts positive integers with separators', () => {
    expect(limitsUtils.parseLimitInput('10,000,000')).toEqual({
      kind: 'value',
      value: 10000000,
    });
    expect(limitsUtils.parseLimitInput('1 000')).toEqual({
      kind: 'value',
      value: 1000,
    });
  });

  it('rejects zero, decimals and text', () => {
    expect(limitsUtils.parseLimitInput('0').kind).toBe('invalid');
    expect(limitsUtils.parseLimitInput('1.5').kind).toBe('invalid');
    expect(limitsUtils.parseLimitInput('many').kind).toBe('invalid');
  });
});

describe('limitsUtils.editFormSchema', () => {
  const schema = limitsUtils.editFormSchema({
    workflowsCeiling: 1000,
    monthlyRunsCeiling: 10000000,
    currentWorkflows: 12,
  });

  it('accepts values within the bounds and empty values', () => {
    expect(
      schema.safeParse({ workflowsLimit: '50', monthlyRunsLimit: '' }).success,
    ).toBe(true);
  });

  it('refuses a workflow limit below the current count', () => {
    const result = schema.safeParse({
      workflowsLimit: '10',
      monthlyRunsLimit: '',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      'workflowsLimitBelowCurrentCount',
    );
  });

  it('refuses limits above the instance limits', () => {
    const result = schema.safeParse({
      workflowsLimit: '1001',
      monthlyRunsLimit: '10000001',
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'workflowsLimitAboveInstanceLimit',
      'monthlyRunsLimitAboveInstanceLimit',
    ]);
  });

  it('refuses non numeric values', () => {
    const result = schema.safeParse({
      workflowsLimit: 'abc',
      monthlyRunsLimit: '-1',
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'positiveIntegerRequired',
      'positiveIntegerRequired',
    ]);
  });
});

describe('limitsUtils usage helpers', () => {
  it('turns red from 90% and amber from 70%', () => {
    expect(limitsUtils.usageTone(0.95)).toBe('danger');
    expect(limitsUtils.usageTone(0.9)).toBe('danger');
    expect(limitsUtils.usageTone(0.75)).toBe('warning');
    expect(limitsUtils.usageTone(0.2)).toBe('normal');
    expect(limitsUtils.usageTone(null)).toBe('normal');
  });

  it('computes ratios and percentages', () => {
    expect(limitsUtils.usageRatio({ used: 5, limit: 10 })).toBe(0.5);
    expect(limitsUtils.usageRatio({ used: 5, limit: null })).toBeNull();
    expect(limitsUtils.formatPercent(0.5)).toBe('50.0%');
    expect(limitsUtils.formatPercent(0.0000001)).toBe('<0.1%');
    expect(limitsUtils.formatPercent(null)).toBe('—');
  });

  it('formats megabyte values', () => {
    expect(
      limitsUtils.formatValue({ unit: InstanceLimitUnit.MEGABYTES, value: 4 }),
    ).toBe('4 MB');
  });

  it('maps the form values to the request', () => {
    expect(limitsUtils.toRequestValue('')).toBeNull();
    expect(limitsUtils.toRequestValue('1,000')).toBe(1000);
  });
});

describe('limitsUtils.isUnenforced', () => {
  const limit = (overrides: Partial<InstanceLimit>): InstanceLimit => ({
    key: InstanceLimitKey.CONCURRENT_RUNS,
    value: 100,
    unit: InstanceLimitUnit.COUNT,
    envVar: 'FEMA_MAX_CONCURRENT_RUNS',
    legacyEnvVar: null,
    inheritedFromEnvVar: null,
    source: InstanceLimitSource.DEFAULT,
    usage: 0,
    ...overrides,
  });

  it('treats the default concurrency as not enforced', () => {
    expect(limitsUtils.isUnenforced(limit({}))).toBe(true);
  });

  it('treats an explicit concurrency cap as enforced', () => {
    expect(
      limitsUtils.isUnenforced(limit({ source: InstanceLimitSource.ENV })),
    ).toBe(false);
  });

  it('keeps other defaults enforced', () => {
    expect(
      limitsUtils.isUnenforced(limit({ key: InstanceLimitKey.RUNS_PER_MONTH })),
    ).toBe(false);
  });
});
