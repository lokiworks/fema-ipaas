import {
  GenericStepOutput,
  RunLogScope,
  RunRerunBlockReason,
  StepOutputStatus,
  WorkflowActionType,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { runLogUiUtils } from '@/features/run-logs/utils/run-log-ui-utils';

describe('runLogUiUtils', () => {
  it('labels every rerun block reason', () => {
    Object.values(RunRerunBlockReason).forEach((reason) => {
      expect(runLogUiUtils.blockReasonLabel(reason).length).toBeGreaterThan(0);
    });
  });

  it('uses the longest project retention as the query window', () => {
    const scope: RunLogScope = {
      projects: [
        { id: 'p1', displayName: 'A', retentionDays: 30, canRerun: true },
        { id: 'p2', displayName: 'B', retentionDays: 14, canRerun: false },
      ],
      workflows: [],
      connectors: [],
      tenantRetentionDays: 30,
      canManagePrivacy: false,
    };
    expect(runLogUiUtils.maxRetentionDays(scope)).toBe(30);
  });

  it('lists steps in execution order when the version is unavailable', () => {
    const nodes = runLogUiUtils.stepNodes({
      trigger: undefined,
      loopIndexes: {},
      steps: {
        trigger: GenericStepOutput.create({
          type: WorkflowActionType.CODE,
          status: StepOutputStatus.SUCCEEDED,
          input: {},
          output: { ok: true },
        }).setDuration(12),
        step_1: GenericStepOutput.create({
          type: WorkflowActionType.CODE,
          status: StepOutputStatus.FAILED,
          input: { a: 1 },
        }).setErrorMessage('boom'),
      },
    });
    expect(nodes.map((node) => [node.name, node.status])).toEqual([
      ['trigger', StepOutputStatus.SUCCEEDED],
      ['step_1', StepOutputStatus.FAILED],
    ]);
    expect(nodes[1].errorMessage).toBe('boom');
  });
});
