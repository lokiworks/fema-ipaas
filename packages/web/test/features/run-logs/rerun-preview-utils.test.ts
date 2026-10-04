import { WorkflowRetryStrategy } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { rerunPreviewUtils } from '@/features/run-logs/utils/rerun-preview-utils';

const stepOrder = ['trigger', 'map', 'create_user', 'notify'];

const writeSteps = [
  { stepName: 'create_user', displayName: 'Create user', destructive: false },
  { stepName: 'notify', displayName: 'Notify', destructive: false },
];

describe('rerunPreviewUtils.splitWriteSteps', () => {
  it('keeps write steps before the failed step and runs the rest', () => {
    const split = rerunPreviewUtils.splitWriteSteps({
      stepOrder,
      writeSteps,
      failedStepName: 'notify',
      strategy: WorkflowRetryStrategy.FROM_FAILED_STEP,
    });
    expect(split.kept.map((step) => step.stepName)).toEqual(['create_user']);
    expect(split.executed.map((step) => step.stepName)).toEqual(['notify']);
  });

  it('runs every write step from the failed step when it is the first write', () => {
    const split = rerunPreviewUtils.splitWriteSteps({
      stepOrder,
      writeSteps,
      failedStepName: 'map',
      strategy: WorkflowRetryStrategy.FROM_FAILED_STEP,
    });
    expect(split.kept).toEqual([]);
    expect(split.executed).toHaveLength(2);
  });

  it('runs every write step again on a whole rerun', () => {
    const split = rerunPreviewUtils.splitWriteSteps({
      stepOrder,
      writeSteps,
      failedStepName: 'notify',
      strategy: WorkflowRetryStrategy.ON_LATEST_VERSION,
    });
    expect(split.kept).toEqual([]);
    expect(split.executed).toHaveLength(2);
  });
});

describe('rerunPreviewUtils.groupRuns', () => {
  it('groups runs of the same version and failed step', () => {
    const run = {
      workflowId: 'w',
      workflowName: 'Hire',
      workflowVersionId: 'v1',
      versionNumber: 1,
      failedStepName: 'map',
    };
    const groups = rerunPreviewUtils.groupRuns({
      runs: [run, run, { ...run, failedStepName: 'notify' }],
    });
    expect(groups.map((group) => group.count)).toEqual([2, 1]);
  });
});
