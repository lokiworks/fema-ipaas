import { describe, expect, it } from 'vitest';

import { operatorUtils } from './operator-utils';

describe('operatorUtils.isOperator', () => {
  it('is true only for the OPERATOR instance role', () => {
    expect(operatorUtils.isOperator({ instanceRole: 'OPERATOR' })).toBe(true);
    expect(operatorUtils.isOperator({ instanceRole: null })).toBe(false);
    expect(operatorUtils.isOperator({})).toBe(false);
    expect(operatorUtils.isOperator(null)).toBe(false);
  });
});

describe('operatorUtils.parseLimitInput', () => {
  it('treats empty input as unlimited', () => {
    expect(operatorUtils.parseLimitInput('  ')).toEqual({
      ok: true,
      value: null,
    });
  });

  it('parses non-negative integers including zero', () => {
    expect(operatorUtils.parseLimitInput('0')).toEqual({ ok: true, value: 0 });
    expect(operatorUtils.parseLimitInput(' 25 ')).toEqual({
      ok: true,
      value: 25,
    });
  });

  it('rejects negatives, decimals and text', () => {
    expect(operatorUtils.parseLimitInput('-1').ok).toBe(false);
    expect(operatorUtils.parseLimitInput('1.5').ok).toBe(false);
    expect(operatorUtils.parseLimitInput('abc').ok).toBe(false);
  });
});

describe('operatorUtils.buildLimitsUpdate', () => {
  const base = {
    usersLimit: '10',
    projectsLimit: '',
    activeWorkflowsLimit: '50',
    concurrentExecutionsLimit: '5',
    workerGroupId: '  ',
  };

  it('maps empty inputs to null', () => {
    expect(operatorUtils.buildLimitsUpdate(base)).toEqual({
      ok: true,
      limits: {
        usersLimit: 10,
        projectsLimit: null,
        activeWorkflowsLimit: 50,
        concurrentExecutionsLimit: 5,
        workerGroupId: null,
      },
    });
  });

  it('reports the first invalid field', () => {
    expect(
      operatorUtils.buildLimitsUpdate({ ...base, activeWorkflowsLimit: 'x' }),
    ).toEqual({ ok: false, field: 'activeWorkflowsLimit' });
  });
});

describe('operatorUtils.usageTone', () => {
  it('has no tone without a limit', () => {
    expect(operatorUtils.usageTone({ used: 99, limit: null })).toBe('normal');
  });

  it('warns from 80 percent and flags at the limit', () => {
    expect(operatorUtils.usageTone({ used: 7, limit: 10 })).toBe('normal');
    expect(operatorUtils.usageTone({ used: 8, limit: 10 })).toBe('warning');
    expect(operatorUtils.usageTone({ used: 10, limit: 10 })).toBe('danger');
    expect(operatorUtils.usageTone({ used: 1, limit: 0 })).toBe('danger');
    expect(operatorUtils.usageRatio({ used: 20, limit: 10 })).toBe(1);
  });
});

describe('operatorUtils.buildOwnerInput', () => {
  it('detects an email owner', () => {
    expect(
      operatorUtils.buildOwnerInput({
        contact: ' Owner@Example.com ',
        firstName: 'Li',
        lastName: '',
      }),
    ).toEqual({ email: 'owner@example.com', firstName: 'Li' });
  });

  it('detects a mainland phone owner and adds the country code', () => {
    expect(
      operatorUtils.buildOwnerInput({
        contact: '138 0013 8000',
        firstName: '',
        lastName: '',
      }),
    ).toEqual({ phone: '+8613800138000' });
  });

  it('returns null for something that is neither', () => {
    expect(
      operatorUtils.buildOwnerInput({
        contact: 'not a contact',
        firstName: '',
        lastName: '',
      }),
    ).toBeNull();
  });
});

describe('operatorUtils.slugFromName', () => {
  it('builds a slug from latin names', () => {
    expect(operatorUtils.slugFromName('Acme Corp.')).toBe('acme-corp');
  });

  it('returns empty when nothing usable remains', () => {
    expect(operatorUtils.slugFromName('某某公司')).toBe('');
    expect(operatorUtils.slugFromName('A')).toBe('');
  });
});

describe('operatorUtils.parseSubjects', () => {
  it('splits and deduplicates', () => {
    expect(operatorUtils.parseSubjects('a, b\nb;c')).toEqual(['a', 'b', 'c']);
  });
});
