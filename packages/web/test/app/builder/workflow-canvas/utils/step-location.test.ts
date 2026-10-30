import {
  BranchExecutionType,
  RouterExecutionType,
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import {
  StepLocationKind,
  stepLocationUtils,
} from '@/app/builder/workflow-canvas/utils/step-location';

const DATE = '2026-10-30T00:00:00.000Z';

function sendMessage({ name }: { name: string }): ConnectorAction {
  return {
    name,
    type: WorkflowActionType.CONNECTOR,
    valid: true,
    displayName: 'Send group message',
    lastUpdatedDate: DATE,
    settings: {
      connectorName: '@fema-ipaas/connector-feishu',
      connectorVersion: '0.0.1',
      actionName: 'send',
      input: {},
      propertySettings: {},
      errorHandlingOptions: undefined,
    },
  };
}

const writeTable: ConnectorAction = {
  ...sendMessage({ name: 'step_4' }),
  displayName: 'Write table',
  continueOnFailureBranches: {
    onFailure: sendMessage({ name: 'step_5' }),
  },
};

const trigger: WorkflowTrigger = {
  name: 'trigger',
  type: WorkflowTriggerType.EMPTY,
  valid: true,
  displayName: 'Employee changed',
  lastUpdatedDate: DATE,
  settings: {},
  nextAction: {
    name: 'step_1',
    type: WorkflowActionType.ROUTER,
    valid: true,
    displayName: 'By department',
    lastUpdatedDate: DATE,
    settings: {
      executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
      branches: [
        {
          branchName: 'R&D',
          branchType: BranchExecutionType.CONDITION,
          conditions: [],
        },
        { branchName: 'Otherwise', branchType: BranchExecutionType.FALLBACK },
      ],
    },
    children: [
      {
        name: 'step_2',
        type: WorkflowActionType.LOOP_ON_ITEMS,
        valid: true,
        displayName: 'Each person',
        lastUpdatedDate: DATE,
        settings: { items: '{{trigger.people}}' },
        firstLoopAction: sendMessage({ name: 'step_3' }),
      },
      sendMessage({ name: 'step_6' }),
    ],
    nextAction: writeTable,
  },
};

describe('stepLocationUtils', () => {
  it('numbers steps in canvas order and lists the containers around them', () => {
    expect(stepLocationUtils.locate({ trigger, stepName: 'step_3' })).toEqual({
      ordinal: 4,
      path: [
        {
          kind: StepLocationKind.BRANCH,
          stepDisplayName: 'By department',
          branchName: 'R&D',
        },
        { kind: StepLocationKind.LOOP, stepDisplayName: 'Each person' },
      ],
    });
  });

  it('tells two steps with the same name apart', () => {
    expect(stepLocationUtils.label({ trigger, stepName: 'step_3' })).toBe(
      'Step 4 · By department branch R&D / Inside loop Each person',
    );
    expect(stepLocationUtils.label({ trigger, stepName: 'step_6' })).toBe(
      'Step 5 · By department branch Otherwise',
    );
    expect(stepLocationUtils.label({ trigger, stepName: 'step_5' })).toBe(
      'Step 7 · Write table branch On failure',
    );
  });

  it('gives top-level steps only their number and unknown steps nothing', () => {
    expect(stepLocationUtils.label({ trigger, stepName: 'step_4' })).toBe(
      'Step 6',
    );
    expect(stepLocationUtils.locate({ trigger, stepName: 'gone' })).toBeNull();
    expect(stepLocationUtils.label({ trigger, stepName: 'gone' })).toBe('');
  });
});

type ConnectorAction = Extract<
  WorkflowAction,
  { type: WorkflowActionType.CONNECTOR }
>;
