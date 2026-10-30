import { ExecutionStatus } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { runFocusUtils } from '@/features/run-logs/utils/run-focus-utils';

describe('runFocusUtils', () => {
  it('opens the latest failed run of an issue, skipping later successful reruns', () => {
    const picked = runFocusUtils.pickFailedRun([
      { id: 'rerun', status: ExecutionStatus.SUCCEEDED },
      { id: 'failed', status: ExecutionStatus.FAILED },
      { id: 'older', status: ExecutionStatus.TIMEOUT },
    ]);
    expect(picked?.id).toBe('failed');
  });

  it('falls back to the latest run when none failed, and to nothing when there is no run', () => {
    expect(
      runFocusUtils.pickFailedRun([
        { id: 'only', status: ExecutionStatus.SUCCEEDED },
      ])?.id,
    ).toBe('only');
    expect(runFocusUtils.pickFailedRun([])).toBeNull();
  });

  it('round-trips the failed step, the panel and the issue through the run link', () => {
    const path = runFocusUtils.runPath({
      runId: 'run1',
      stepName: 'step_1',
      panel: 'input',
      issueId: 'issue1',
    });
    expect(path.startsWith('/runs/run1?')).toBe(true);
    const focus = runFocusUtils.parse(new URLSearchParams(path.split('?')[1]));
    expect(focus).toEqual({
      stepName: 'step_1',
      panel: 'input',
      issueId: 'issue1',
    });
  });

  it('builds a plain run link when there is nothing to focus', () => {
    expect(
      runFocusUtils.runPath({
        runId: 'run1',
        stepName: null,
        panel: null,
        issueId: null,
      }),
    ).toBe('/runs/run1');
  });

  it('opens the error handling tab for error handling fixes and the run data tab otherwise', () => {
    expect(runFocusUtils.stepPanelTab('error')).toBe('error');
    expect(runFocusUtils.stepPanelTab('input')).toBe('input');
    expect(
      runFocusUtils.parse(new URLSearchParams('panel=other')).panel,
    ).toBeNull();
  });
});
