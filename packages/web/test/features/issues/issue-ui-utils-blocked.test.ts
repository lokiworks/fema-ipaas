import { blockedUntilMarker } from '@fema-ipaas/core-utils';
import { IssueInsightCause, ReplayReason } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { issueUiUtils } from '@/features/issues/utils/issue-ui-utils';

describe('issueUiUtils blocked-until texts', () => {
  const blockedUntil = '2026-10-03T16:00:00.000Z';

  it('says not to retry until the blocked time and drops the retry advice', () => {
    const text = issueUiUtils.causeText({
      cause: IssueInsightCause.BLOCKED_UNTIL,
      httpStatus: 429,
      blockedUntil,
    });
    expect(text).toContain('refuses calls until');
    expect(text).toContain('do not retry now');
    expect(text).not.toContain('{time}');
    expect(text).not.toContain('configure retries');
  });

  it('keeps the plain rate-limit advice for a limit without a blocked time', () => {
    const text = issueUiUtils.causeText({
      cause: IssueInsightCause.RATE_LIMITED,
      httpStatus: 429,
    });
    expect(text).toContain('rate limiting');
  });

  it('puts the blocked time into the replay reason', () => {
    const label = issueUiUtils.replayReasonLabel(
      ReplayReason.BLOCKED_UNTIL,
      blockedUntil,
    );
    expect(label).toContain('refuses calls until');
    expect(label).toContain('2026');
    expect(label).not.toContain('{time}');
  });

  it('falls back to a generic phrase when the time is missing or unreadable', () => {
    expect(
      issueUiUtils.replayReasonLabel(ReplayReason.BLOCKED_UNTIL, null),
    ).toBe(
      'The other system refuses calls until the block ends; replay after that',
    );
    expect(
      issueUiUtils.replayReasonLabel(ReplayReason.BLOCKED_UNTIL, 'garbage'),
    ).toContain('the block ends');
  });

  it('hides the machine-readable marker from the shown message', () => {
    const message = blockedUntilMarker.attach({
      message: 'HTTP 429: Beisen API rate limit exceeded',
      until: new Date(blockedUntil),
    });
    expect(issueUiUtils.messageText(message)).toBe(
      'HTTP 429: Beisen API rate limit exceeded',
    );
    expect(issueUiUtils.messageText('plain failure')).toBe('plain failure');
  });
});
