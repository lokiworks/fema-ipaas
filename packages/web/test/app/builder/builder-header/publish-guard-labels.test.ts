import { describe, expect, it } from 'vitest';

import { publishGuardLabels } from '@/app/builder/builder-header/publish-guard-labels';

describe('publishGuardLabels.dialogLabels', () => {
  it('keeps the publish wording for the production target', () => {
    const labels = publishGuardLabels.dialogLabels({
      target: 'production',
    });
    expect(labels.title).toBe('Publish with warnings?');
    expect(labels.confirm).toBe('Publish anyway');
  });

  it('says deploy to test, not publish, when the target is the test environment', () => {
    const labels = publishGuardLabels.dialogLabels({
      target: 'test',
    });
    expect(labels.title).toBe('Deploy to test with warnings?');
    expect(labels.confirm).toBe('Deploy to test anyway');
    expect(labels.description).not.toMatch(/publish/i);
  });
});
