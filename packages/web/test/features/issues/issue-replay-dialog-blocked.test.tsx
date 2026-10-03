/**
 * @vitest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import { ReplayCategory, ReplayReason } from '@fema-ipaas/shared';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { IssueReplayDialog } from '@/features/issues/components/issue-replay-dialog';

const items = [
  {
    executionId: 'run-1',
    category: ReplayCategory.BLOCKED,
    reason: ReplayReason.BLOCKED_UNTIL,
    connectionExternalId: null,
    rawDataExpired: false,
    blockedUntil: '2026-10-03T16:00:00.000Z',
  },
  {
    executionId: 'run-2',
    category: ReplayCategory.BLOCKED,
    reason: ReplayReason.BLOCKED_UNTIL,
    connectionExternalId: null,
    rawDataExpired: false,
    blockedUntil: '2026-10-04T16:00:00.000Z',
  },
];

vi.mock('@/features/issues/hooks/issues-hooks', () => ({
  issuesHooks: {
    useReplayCheck: () => ({ data: { items }, isLoading: false }),
    useReplay: () => ({ mutate: vi.fn(), isPending: false }),
  },
}));

describe('IssueReplayDialog with runs blocked until a later time', () => {
  it('lists them as blocked with the reason, offers no way to include them and replays nothing', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <IssueReplayDialog issueId="issue-1" open onOpenChange={vi.fn()} />,
      );
    });
    const dialog = document.querySelector('[role=dialog]');
    expect(dialog?.textContent).toContain('Blocked');
    expect(dialog?.textContent).toContain('refuses calls until');
    expect(dialog?.textContent).toContain('2');
    expect(dialog?.querySelector('[role=checkbox]')).toBeNull();
    const replayButton = Array.from(
      dialog?.querySelectorAll('button') ?? [],
    ).find((button) => button.textContent?.includes('Replay 0 runs'));
    expect(replayButton).toBeDefined();
    expect(replayButton?.hasAttribute('disabled')).toBe(true);
    await act(async () => root.unmount());
  });
});
