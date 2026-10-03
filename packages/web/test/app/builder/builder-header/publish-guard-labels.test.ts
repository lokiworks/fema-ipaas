import { describe, expect, it } from 'vitest';

import { publishGuardLabels } from '@/app/builder/builder-header/publish-guard-labels';

describe('publishGuardLabels.dialogLabels', () => {
  it('keeps the publish wording for the production target', () => {
    const labels = publishGuardLabels.dialogLabels({
      target: 'production',
      hasAiPending: false,
    });
    expect(labels.title).toBe('Publish with warnings?');
    expect(labels.confirm).toBe('Publish anyway');
  });

  it('says deploy to test, not publish, when the target is the test environment', () => {
    const labels = publishGuardLabels.dialogLabels({
      target: 'test',
      hasAiPending: false,
    });
    expect(labels.title).toBe('Deploy to test with warnings?');
    expect(labels.confirm).toBe('Deploy to test anyway');
    expect(labels.description).not.toMatch(/publish/i);
  });

  it('uses the reminder wording when AI steps are unconfirmed', () => {
    expect(
      publishGuardLabels.dialogLabels({ target: 'test', hasAiPending: true })
        .title,
    ).toBe('Deploy reminder');
    expect(
      publishGuardLabels.dialogLabels({
        target: 'production',
        hasAiPending: true,
      }).title,
    ).toBe('Publish reminder');
  });
});
