import { describe, expect, it } from 'vitest';

import { triggerSettingsValidation } from '@/features/trigger-runtime/utils/trigger-settings-validation';

describe('triggerSettingsValidation.issuesOf', () => {
  it('requires a trigger-only dedupe key when dedupe is on', () => {
    expect(
      triggerSettingsValidation.issuesOf({
        dedupe: { enabled: true, keyPath: '' },
      }),
    ).toEqual([{ path: ['dedupe', 'keyPath'], message: 'dedupeKeyRequired' }]);
    expect(
      triggerSettingsValidation.issuesOf({
        dedupe: { enabled: true, keyPath: '{{step_2.id}}' },
      }),
    ).toEqual([
      {
        path: ['dedupe', 'keyPath'],
        message: 'dedupeKeyMustReferenceTrigger',
      },
    ]);
    expect(
      triggerSettingsValidation.issuesOf({
        dedupe: { enabled: false, keyPath: '' },
      }),
    ).toEqual([]);
  });

  it('flags malformed five-field cron expressions', () => {
    const base = {
      connectorName: '@fema-ipaas/connector-schedule',
      triggerName: 'cron_expression',
    };
    expect(
      triggerSettingsValidation.issuesOf({
        ...base,
        input: { cronExpression: '0 9 * * 1-5' },
      }),
    ).toEqual([]);
    expect(
      triggerSettingsValidation.issuesOf({
        ...base,
        input: { cronExpression: '0 9 * *' },
      }),
    ).toEqual([
      { path: ['input', 'cronExpression'], message: 'cronExpressionInvalid' },
    ]);
  });

  it('checks the ordering key only when it is set', () => {
    expect(
      triggerSettingsValidation.issuesOf({
        concurrency: { orderKeyPath: '{{step_1.user}}' },
      }),
    ).toEqual([
      {
        path: ['concurrency', 'orderKeyPath'],
        message: 'orderKeyMustReferenceTrigger',
      },
    ]);
    expect(
      triggerSettingsValidation.issuesOf({
        concurrency: { orderKeyPath: 'body.user' },
      }),
    ).toEqual([]);
  });
});
