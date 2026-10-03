import { IssueActivityType } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { issueUiUtils } from '@/features/issues/utils/issue-ui-utils';

describe('issueUiUtils.showsActorInHeader', () => {
  it('names the actor in the header only where the text does not already name them', () => {
    expect(
      issueUiUtils.showsActorInHeader({ type: IssueActivityType.NOTE }),
    ).toBe(true);
    [
      IssueActivityType.STATUS_CHANGED,
      IssueActivityType.ASSIGNED,
      IssueActivityType.MUTED,
      IssueActivityType.REPLAYED,
    ].forEach((type) =>
      expect(issueUiUtils.showsActorInHeader({ type })).toBe(false),
    );
  });
});
