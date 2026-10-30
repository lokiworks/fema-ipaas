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
    workflowId: 'wf-1',
    workflowVersionId: 'v-1',
    versionNumber: 2,
    failedStepName: 'validate_order',
    category: ReplayCategory.BLOCKED,
    reason: ReplayReason.RAW_DATA_EXPIRED,
    connectionExternalId: null,
    rawDataExpired: true,
    writeSteps: [],
    blockedUntil: null,
  },
];

vi.mock('@/features/issues/hooks/issues-hooks', () => ({
  issuesHooks: {
    useReplayCheck: () => ({
      data: { items, rawDataExpiredCount: 1, rawRetentionDays: 3 },
      isLoading: false,
    }),
    useReplay: () => ({ mutate: vi.fn(), isPending: false }),
  },
}));

describe('IssueReplayDialog with runs whose original data expired', () => {
  it('says how many runs expired and after how many days, and queues nothing', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <IssueReplayDialog
          issueId="issue-1"
          workflowName={null}
          open
          onOpenChange={vi.fn()}
        />,
      );
    });
    const dialog = document.querySelector('[role=dialog]');
    expect(dialog?.textContent).toContain('3-day retention period');
    expect(dialog?.textContent).toContain(
      'The original run data has expired, so this run can no longer be rerun',
    );
    const replayButton = Array.from(
      dialog?.querySelectorAll('button') ?? [],
    ).find((button) => button.textContent?.includes('Rerun 0'));
    expect(replayButton?.hasAttribute('disabled')).toBe(true);
    await act(async () => root.unmount());
  });
});
