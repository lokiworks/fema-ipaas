import { describe, expect, it } from 'vitest';

import { unpublishedChanges } from '@/app/builder/builder-header/unpublished-changes';

const BASE = {
  hasDeployment: true,
  isDraft: true,
  draftChanged: true as boolean | null,
};

describe('unpublishedChanges.hasUnpublishedChanges', () => {
  it('is true when the draft differs from the published version', () => {
    expect(unpublishedChanges.hasUnpublishedChanges(BASE)).toBe(true);
  });

  it('is false when the draft matches the published version', () => {
    expect(
      unpublishedChanges.hasUnpublishedChanges({
        ...BASE,
        draftChanged: false,
      }),
    ).toBe(false);
  });

  it('stays true while the comparison is still loading', () => {
    expect(
      unpublishedChanges.hasUnpublishedChanges({ ...BASE, draftChanged: null }),
    ).toBe(true);
  });

  it('is false for a workflow that was never deployed', () => {
    expect(
      unpublishedChanges.hasUnpublishedChanges({
        ...BASE,
        hasDeployment: false,
      }),
    ).toBe(false);
  });

  it('is false when viewing a locked version', () => {
    expect(
      unpublishedChanges.hasUnpublishedChanges({ ...BASE, isDraft: false }),
    ).toBe(false);
  });
});
