import { ExecutionStatus, StepOutputStatus } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { runLogErrorSummary } from '@/features/run-logs/utils/run-log-error-summary';

const node = (name: string, status: StepOutputStatus | null) => ({
  name,
  displayName: `${name} step`,
  status,
});

describe('runLogErrorSummary', () => {
  it('names the step the run failed at, the same one the list shows', () => {
    const row = {
      errorCount: 1,
      failedStep: { name: 'b', displayName: 'b step' },
    };
    const summary = runLogErrorSummary.summarize({
      runStatus: ExecutionStatus.FAILED,
      failedStepName: 'b',
      nodes: [
        node('a', StepOutputStatus.FAILED),
        node('b', StepOutputStatus.FAILED),
      ],
    });
    expect(runLogErrorSummary.failedStepName(row)).toBe('b step');
    expect(summary).toEqual({
      kind: 'FAILED_AT',
      failingNode: 'b step',
      continuedCount: 1,
    });
  });

  it('does not report a failure for a run that succeeded with continue-on-failure steps', () => {
    const summary = runLogErrorSummary.summarize({
      runStatus: ExecutionStatus.SUCCEEDED,
      failedStepName: null,
      nodes: [
        node('a', StepOutputStatus.FAILED),
        node('b', StepOutputStatus.SUCCEEDED),
      ],
    });
    expect(
      runLogErrorSummary.failedStepName({ errorCount: 0, failedStep: null }),
    ).toBeNull();
    expect(summary).toEqual({
      kind: 'CONTINUED_ONLY',
      failingNode: null,
      continuedCount: 1,
    });
  });

  it('marks a failed run without a known step', () => {
    expect(
      runLogErrorSummary.failedStepName({ errorCount: 1, failedStep: null }),
    ).toBe('');
    expect(
      runLogErrorSummary.summarize({
        runStatus: ExecutionStatus.SUCCEEDED,
        failedStepName: null,
        nodes: [node('a', StepOutputStatus.SUCCEEDED)],
      }).kind,
    ).toBe('NONE');
  });
});
