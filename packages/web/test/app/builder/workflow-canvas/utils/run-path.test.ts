import {
  BranchExecutionType,
  RouterExecutionType,
  StepOutputStatus,
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import {
  RunStepOutput,
  runPathUtils,
} from '@/app/builder/workflow-canvas/utils/run-path';

const DATE = '2026-05-02T00:00:00.000Z';

function codeStep({
  name,
  onFailure,
}: {
  name: string;
  onFailure?: WorkflowAction;
}): WorkflowAction {
  return {
    name,
    type: WorkflowActionType.CODE,
    valid: true,
    displayName: name,
    lastUpdatedDate: DATE,
    settings: {
      sourceCode: { code: '', packageJson: '{}' },
      input: {},
      errorHandlingOptions: {},
    },
    ...(onFailure ? { continueOnFailureBranches: { onFailure } } : {}),
  };
}

function flow(): WorkflowTrigger {
  const router: WorkflowAction = {
    name: 'router_1',
    type: WorkflowActionType.ROUTER,
    valid: true,
    displayName: 'Router',
    lastUpdatedDate: DATE,
    settings: {
      executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
      branches: [
        {
          branchName: 'Full time',
          branchType: BranchExecutionType.CONDITION,
          conditions: [],
        },
        { branchName: 'Otherwise', branchType: BranchExecutionType.FALLBACK },
      ],
    },
    children: [
      codeStep({
        name: 'open_account',
        onFailure: codeStep({ name: 'notify' }),
      }),
      null,
    ],
    nextAction: codeStep({ name: 'after' }),
  };
  return {
    name: 'trigger',
    type: WorkflowTriggerType.EMPTY,
    valid: true,
    displayName: 'Trigger',
    lastUpdatedDate: DATE,
    settings: {},
    nextAction: router,
  };
}

function outputs(
  entries: Record<string, RunStepOutput>,
): (stepName: string) => RunStepOutput | undefined {
  return (stepName) => entries[stepName];
}

const FALLBACK_TAKEN = {
  trigger: { status: StepOutputStatus.SUCCEEDED, output: {} },
  router_1: {
    status: StepOutputStatus.SUCCEEDED,
    output: {
      branches: [
        { branchName: 'Full time', branchIndex: 1, evaluation: false },
        { branchName: 'Otherwise', branchIndex: 2, evaluation: true },
      ],
    },
  },
  after: { status: StepOutputStatus.SUCCEEDED, output: {} },
};

describe('runPathUtils.runPathOf', () => {
  it('marks the branch the router did not take and the steps inside it', () => {
    const path = runPathUtils.runPathOf({
      trigger: flow(),
      finished: true,
      outputOf: outputs(FALLBACK_TAKEN),
    });
    expect(path.branchStates['router_1:0']).toBe('skipped');
    expect(path.branchStates['router_1:1']).toBe('taken');
    expect([...path.notExecuted].sort()).toEqual(['notify', 'open_account']);
    expect(path.executed.has('after')).toBe(true);
  });

  it('greys out a skipped branch while the run is still going', () => {
    const path = runPathUtils.runPathOf({
      trigger: flow(),
      finished: false,
      outputOf: outputs({
        trigger: FALLBACK_TAKEN.trigger,
        router_1: FALLBACK_TAKEN.router_1,
      }),
    });
    expect(path.notExecuted.has('open_account')).toBe(true);
    expect(path.notExecuted.has('after')).toBe(false);
  });

  it('follows the exception branch when a step failed and continued', () => {
    const path = runPathUtils.runPathOf({
      trigger: flow(),
      finished: true,
      outputOf: outputs({
        trigger: FALLBACK_TAKEN.trigger,
        router_1: {
          status: StepOutputStatus.SUCCEEDED,
          output: {
            branches: [
              { branchName: 'Full time', branchIndex: 1, evaluation: true },
              { branchName: 'Otherwise', branchIndex: 2, evaluation: true },
            ],
          },
        },
        open_account: { status: StepOutputStatus.FAILED, output: {} },
        notify: { status: StepOutputStatus.SUCCEEDED, output: {} },
      }),
    });
    expect(path.branchStates['router_1:0']).toBe('taken');
    expect(path.branchStates['router_1:1']).toBe('skipped');
    expect(path.branchStates['open_account:cof:1']).toBe('taken');
    expect(path.branchStates['open_account:cof:0']).toBe('skipped');
    expect(path.notExecuted.has('notify')).toBe(false);
  });
});

describe('runPathUtils.edgeStateOf', () => {
  const path = runPathUtils.runPathOf({
    trigger: flow(),
    finished: true,
    outputOf: outputs(FALLBACK_TAKEN),
  });

  it('highlights the taken branch and dims the empty skipped one', () => {
    expect(
      runPathUtils.edgeStateOf({
        path,
        edgeId: 'router_1-branch-1-start-edge',
        source: 'router_1',
        nextStepName: null,
      }),
    ).toBe('on');
    expect(
      runPathUtils.edgeStateOf({
        path,
        edgeId: 'open_account-cof-branch-1-start-edge',
        source: 'open_account',
        nextStepName: null,
      }),
    ).toBe('off');
  });

  it('keeps the shared trunk line of the first branch undimmed', () => {
    expect(
      runPathUtils.edgeStateOf({
        path,
        edgeId: 'router_1-branch-0-end-edge',
        source: 'open_account',
        nextStepName: null,
      }),
    ).toBe('neutral');
  });

  it('dims the line out of a step that never ran', () => {
    expect(
      runPathUtils.edgeStateOf({
        path,
        edgeId: 'open_account-graph-end-edge',
        source: 'open_account',
        nextStepName: null,
      }),
    ).toBe('off');
  });

  it('parses failure branch edges', () => {
    expect(
      runPathUtils.branchOfEdgeId(
        'big-button-straight-line-foropen_account-cof-branch-0-start-edge',
      ),
    ).toEqual({
      key: 'open_account:cof:0',
      stepName: 'open_account',
      branchIndex: 0,
      isEnd: false,
      carriesTrunk: false,
    });
  });
});

describe('runPathUtils.routerHitBranchNames', () => {
  it('names the branch the router took', () => {
    const router = flow().nextAction;
    expect(
      router &&
        runPathUtils.routerHitBranchNames({
          step: router,
          output: FALLBACK_TAKEN.router_1.output,
        }),
    ).toEqual(['Otherwise']);
  });
});
