import {
  BranchExecutionType,
  RouterExecutionType,
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import { readFileSync } from 'fs';
import path from 'path';

import i18n from 'i18next';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

function workflowWith({
  routerName,
  firstBranchName,
}: {
  routerName: string;
  firstBranchName: string;
}): WorkflowTrigger {
  return {
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
      displayName: routerName,
      lastUpdatedDate: DATE,
      settings: {
        executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
        branches: [
          {
            branchName: firstBranchName,
            branchType: BranchExecutionType.CONDITION,
            conditions: [],
          },
          {
            branchName: 'Otherwise',
            branchType: BranchExecutionType.FALLBACK,
          },
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
}

const trigger = workflowWith({
  routerName: 'By department',
  firstBranchName: 'R&D',
});

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
      'Step 4 · Inside branch R&D of By department / Inside loop Each person',
    );
    expect(stepLocationUtils.label({ trigger, stepName: 'step_6' })).toBe(
      'Step 5 · Inside branch Otherwise of By department',
    );
    expect(stepLocationUtils.label({ trigger, stepName: 'step_5' })).toBe(
      'Step 7 · Inside the On failure branch of Write table',
    );
  });

  describe('in Chinese', () => {
    beforeAll(async () => {
      i18n.addResourceBundle('zh', 'translation', ZH_TRANSLATION);
      await i18n.changeLanguage('zh');
    });
    afterAll(async () => {
      await i18n.changeLanguage('en');
    });

    it('does not repeat the word branch when the branch is named after it', () => {
      const unnamed = workflowWith({
        routerName: '条件分支',
        firstBranchName: '',
      });
      expect(stepLocationUtils.label({ trigger: unnamed, stepName: 'step_6' })).toBe(
        '第 5 步 · 条件分支「否则」内',
      );
      expect(stepLocationUtils.label({ trigger: unnamed, stepName: 'step_3' })).toBe(
        '第 4 步 · 条件分支「分支 1」内 / 循环「Each person」内',
      );
      expect(stepLocationUtils.label({ trigger, stepName: 'step_5' })).toBe(
        '第 7 步 · Write table「失败」分支内',
      );
    });
  });

  it('gives top-level steps only their number and unknown steps nothing', () => {
    expect(stepLocationUtils.label({ trigger, stepName: 'step_4' })).toBe(
      'Step 6',
    );
    expect(stepLocationUtils.locate({ trigger, stepName: 'gone' })).toBeNull();
    expect(stepLocationUtils.label({ trigger, stepName: 'gone' })).toBe('');
  });
});

const ZH_TRANSLATION = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../public/locales/zh/translation.json'),
    'utf-8',
  ),
);

type ConnectorAction = Extract<
  WorkflowAction,
  { type: WorkflowActionType.CONNECTOR }
>;
