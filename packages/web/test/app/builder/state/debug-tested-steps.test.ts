import {
  Execution,
  ExecutionStatus,
  GenericStepOutput,
  RunEnvironment,
  StepOutputStatus,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
  WorkflowVersion,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { debugTestedStepsUtils } from '@/app/builder/state/debug-tested-steps';

const BEFORE_RUN = '2026-05-02T00:00:00.000Z';
const RUN_FINISHED = '2026-05-02T00:10:00.000Z';
const AFTER_RUN = '2026-05-02T00:20:00.000Z';
const OBSERVED_AT = '2026-05-02T00:10:05.000Z';

function versionOf({
  url,
  code,
  codeUpdatedDate,
}: {
  url: string;
  code: string;
  codeUpdatedDate: string;
}): WorkflowVersion {
  const trigger: WorkflowTrigger = {
    name: 'trigger',
    type: WorkflowTriggerType.EMPTY,
    valid: true,
    displayName: 'Trigger',
    lastUpdatedDate: BEFORE_RUN,
    settings: {},
    nextAction: {
      name: 'http_1',
      type: WorkflowActionType.CONNECTOR,
      valid: true,
      displayName: 'Send HTTP request',
      lastUpdatedDate: BEFORE_RUN,
      settings: {
        connectorName: '@fema-ipaas/connector-http',
        connectorVersion: '0.0.1',
        actionName: 'send_request',
        input: { url },
        propertySettings: {},
        errorHandlingOptions: undefined,
      },
      nextAction: {
        name: 'script_1',
        type: WorkflowActionType.CODE,
        valid: true,
        displayName: 'Code',
        lastUpdatedDate: codeUpdatedDate,
        settings: {
          sourceCode: { code, packageJson: '{}' },
          input: {},
          errorHandlingOptions: undefined,
        },
      },
    },
  };
  return { id: 'version-1', trigger } as WorkflowVersion;
}

function outputOf(status: StepOutputStatus) {
  return GenericStepOutput.create({
    type: WorkflowActionType.CODE,
    status,
    input: {},
    output: {},
  });
}

function runOf({
  steps,
  stepNameToTest,
  finishTime,
  status = ExecutionStatus.SUCCEEDED,
}: {
  steps: Record<string, ReturnType<typeof outputOf>>;
  stepNameToTest?: string;
  finishTime?: string;
  status?: ExecutionStatus;
}): Execution {
  return {
    id: 'run-1',
    environment: RunEnvironment.TESTING,
    status,
    finishTime,
    stepNameToTest,
    steps,
  } as Execution;
}

const unchanged = versionOf({
  url: 'http://a',
  code: 'x',
  codeUpdatedDate: BEFORE_RUN,
});

describe('debugTestedStepsUtils.testedStepsOf', () => {
  it('marks every succeeded step of a finished debug run', () => {
    const tested = debugTestedStepsUtils.testedStepsOf({
      run: runOf({
        finishTime: RUN_FINISHED,
        steps: {
          http_1: outputOf(StepOutputStatus.SUCCEEDED),
          script_1: outputOf(StepOutputStatus.SUCCEEDED),
        },
      }),
      runVersion: unchanged,
      currentVersion: unchanged,
      observedAt: OBSERVED_AT,
    });

    expect(Object.keys(tested).sort()).toEqual(['http_1', 'script_1']);
    expect(tested.http_1.testedAt).toBe(RUN_FINISHED);
  });

  it('marks a run that has no finish time yet using the moment it was observed', () => {
    const tested = debugTestedStepsUtils.testedStepsOf({
      run: runOf({
        steps: { http_1: outputOf(StepOutputStatus.SUCCEEDED) },
      }),
      runVersion: unchanged,
      currentVersion: unchanged,
      observedAt: OBSERVED_AT,
    });

    expect(tested.http_1.testedAt).toBe(OBSERVED_AT);
  });

  it('does not count a run that is still running', () => {
    const tested = debugTestedStepsUtils.testedStepsOf({
      run: runOf({
        status: ExecutionStatus.RUNNING,
        steps: { http_1: outputOf(StepOutputStatus.SUCCEEDED) },
      }),
      runVersion: unchanged,
      currentVersion: unchanged,
      observedAt: OBSERVED_AT,
    });

    expect(tested).toEqual({});
  });

  it('ignores single step test runs and the steps they only primed', () => {
    const tested = debugTestedStepsUtils.testedStepsOf({
      run: runOf({
        stepNameToTest: 'http_1',
        finishTime: RUN_FINISHED,
        steps: {
          http_1: outputOf(StepOutputStatus.SUCCEEDED),
          script_1: outputOf(StepOutputStatus.SUCCEEDED),
        },
      }),
      runVersion: unchanged,
      currentVersion: unchanged,
      observedAt: OBSERVED_AT,
    });

    expect(tested).toEqual({});
  });

  it('records failed steps as failed and succeeded steps as passed', () => {
    const tested = debugTestedStepsUtils.testedStepsOf({
      run: runOf({
        status: ExecutionStatus.FAILED,
        finishTime: RUN_FINISHED,
        steps: {
          http_1: outputOf(StepOutputStatus.FAILED),
          script_1: outputOf(StepOutputStatus.SUCCEEDED),
        },
      }),
      runVersion: unchanged,
      currentVersion: unchanged,
      observedAt: OBSERVED_AT,
    });

    expect(Object.keys(tested).sort()).toEqual(['http_1', 'script_1']);
    expect(tested.http_1.failed).toBe(true);
    expect(tested.script_1.failed).toBe(false);
  });

  it('skips steps that neither succeeded nor failed', () => {
    const tested = debugTestedStepsUtils.testedStepsOf({
      run: runOf({
        status: ExecutionStatus.FAILED,
        finishTime: RUN_FINISHED,
        steps: {
          http_1: outputOf(StepOutputStatus.RUNNING),
          script_1: outputOf(StepOutputStatus.SUCCEEDED),
        },
      }),
      runVersion: unchanged,
      currentVersion: unchanged,
      observedAt: OBSERVED_AT,
    });

    expect(Object.keys(tested)).toEqual(['script_1']);
  });

  it('drops a step whose settings changed since the run', () => {
    const edited = versionOf({
      url: 'http://b',
      code: 'x',
      codeUpdatedDate: BEFORE_RUN,
    });

    const tested = debugTestedStepsUtils.testedStepsOf({
      run: runOf({
        finishTime: RUN_FINISHED,
        steps: {
          http_1: outputOf(StepOutputStatus.SUCCEEDED),
          script_1: outputOf(StepOutputStatus.SUCCEEDED),
        },
      }),
      runVersion: unchanged,
      currentVersion: edited,
      observedAt: OBSERVED_AT,
    });

    expect(Object.keys(tested)).toEqual(['script_1']);
  });

  it('drops a step that was edited after the run even when the run version already carries the edit', () => {
    const editedAfterRun = versionOf({
      url: 'http://a',
      code: 'y',
      codeUpdatedDate: AFTER_RUN,
    });

    const tested = debugTestedStepsUtils.testedStepsOf({
      run: runOf({
        finishTime: RUN_FINISHED,
        steps: {
          http_1: outputOf(StepOutputStatus.SUCCEEDED),
          script_1: outputOf(StepOutputStatus.SUCCEEDED),
        },
      }),
      runVersion: editedAfterRun,
      currentVersion: editedAfterRun,
      observedAt: OBSERVED_AT,
    });

    expect(Object.keys(tested)).toEqual(['http_1']);
  });

  it('gives the same answer for a live run and the same run loaded after a refresh', () => {
    const live = debugTestedStepsUtils.testedStepsOf({
      run: runOf({
        steps: { http_1: outputOf(StepOutputStatus.SUCCEEDED) },
      }),
      runVersion: unchanged,
      currentVersion: unchanged,
      observedAt: OBSERVED_AT,
    });
    const afterRefresh = debugTestedStepsUtils.testedStepsOf({
      run: runOf({
        finishTime: RUN_FINISHED,
        steps: { http_1: outputOf(StepOutputStatus.SUCCEEDED) },
      }),
      runVersion: unchanged,
      currentVersion: unchanged,
      observedAt: AFTER_RUN,
    });

    expect(Object.keys(live)).toEqual(Object.keys(afterRefresh));
    expect(live.http_1.signature).toBe(afterRefresh.http_1.signature);
  });
});

describe('debugTestedStepsUtils.merge', () => {
  it('lets the newer entries override the older ones', () => {
    const merged = debugTestedStepsUtils.merge({
      older: {
        http_1: { testedAt: BEFORE_RUN, signature: 'old', failed: false },
        script_1: { testedAt: BEFORE_RUN, signature: 'kept', failed: false },
      },
      newer: {
        http_1: { testedAt: RUN_FINISHED, signature: 'new', failed: true },
      },
    });

    expect(merged.http_1.signature).toBe('new');
    expect(merged.script_1.signature).toBe('kept');
  });
});

describe('debugTestedStepsUtils.flattenRunSteps', () => {
  it('lifts steps that ran inside loop iterations to the top level', () => {
    const flattened = debugTestedStepsUtils.flattenRunSteps({
      loop_1: {
        type: WorkflowActionType.LOOP_ON_ITEMS,
        status: StepOutputStatus.SUCCEEDED,
        output: {
          item: 'b',
          index: 2,
          iterations: [
            { send_1: { status: StepOutputStatus.FAILED, output: null } },
            {
              send_1: { status: StepOutputStatus.SUCCEEDED, output: { ok: 2 } },
            },
          ],
        },
      },
    });
    expect(Object.keys(flattened).sort()).toEqual(['loop_1', 'send_1']);
    expect(flattened['send_1']).toEqual({
      status: StepOutputStatus.SUCCEEDED,
      output: { ok: 2 },
    });
  });
});
