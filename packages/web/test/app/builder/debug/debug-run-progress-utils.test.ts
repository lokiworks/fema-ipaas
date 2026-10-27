import {
  Execution,
  ExecutionStatus,
  GenericStepOutput,
  RunEnvironment,
  StepOutput,
  StepOutputStatus,
  UpdateRunProgressRequest,
  WorkflowActionType,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { debugRunProgressUtils } from '@/app/builder/debug/debug-run-progress-utils';

const stepOutput: StepOutput = GenericStepOutput.create({
  type: WorkflowActionType.CODE,
  status: StepOutputStatus.SUCCEEDED,
  input: {},
  output: { ok: true },
});

function runOf({
  id,
  steps,
  startTime,
}: {
  id: string;
  steps?: Record<string, StepOutput>;
  startTime?: string;
}): Execution {
  return {
    id,
    environment: RunEnvironment.TESTING,
    status: ExecutionStatus.SUCCEEDED,
    startTime,
    steps,
  } as Execution;
}

describe('debugRunProgressUtils.mergeProgress', () => {
  it('adds the reported step to the steps already known', () => {
    const currentRun = runOf({ id: 'run-1', steps: { step_1: stepOutput } });
    const response: UpdateRunProgressRequest = {
      execution: runOf({ id: 'run-1' }),
      step: { name: 'step_2', path: [], output: stepOutput },
    };
    const merged = debugRunProgressUtils.mergeProgress({
      response,
      currentRun,
      lastRun: null,
    });
    expect(Object.keys(merged.steps ?? {})).toEqual(['step_1', 'step_2']);
  });

  it('keeps the steps of the finished run when a trailing update has no step and the run was cleared', () => {
    const lastRun = runOf({
      id: 'run-1',
      steps: { step_1: stepOutput },
      startTime: '2026-10-28T00:00:00.000Z',
    });
    const response: UpdateRunProgressRequest = {
      execution: runOf({ id: 'run-1' }),
    };
    const merged = debugRunProgressUtils.mergeProgress({
      response,
      currentRun: null,
      lastRun,
    });
    expect(Object.keys(merged.steps ?? {})).toEqual(['step_1']);
    expect(merged.startTime).toBe('2026-10-28T00:00:00.000Z');
  });

  it('does not borrow steps from a different run', () => {
    const lastRun = runOf({ id: 'run-1', steps: { step_1: stepOutput } });
    const response: UpdateRunProgressRequest = {
      execution: runOf({ id: 'run-2' }),
    };
    const merged = debugRunProgressUtils.mergeProgress({
      response,
      currentRun: null,
      lastRun,
    });
    expect(merged.steps).toEqual({});
  });
});

describe('debugRunProgressUtils.isAfterReturnToEditing', () => {
  it('is true only for the run that already returned to editing', () => {
    expect(
      debugRunProgressUtils.isAfterReturnToEditing({
        returnedRunId: 'run-1',
        runId: 'run-1',
      }),
    ).toBe(true);
    expect(
      debugRunProgressUtils.isAfterReturnToEditing({
        returnedRunId: 'run-1',
        runId: 'run-2',
      }),
    ).toBe(false);
    expect(
      debugRunProgressUtils.isAfterReturnToEditing({
        returnedRunId: null,
        runId: 'run-1',
      }),
    ).toBe(false);
  });
});
