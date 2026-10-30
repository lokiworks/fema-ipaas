import {
  BranchExecutionType,
  PropertyExecutionType,
  RouterActionSettings,
  RouterExecutionType,
  WorkflowAction,
  WorkflowActionType,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import {
  CompareContext,
  CompareGroup,
  versionCompareRows,
} from '@/app/builder/workflow-versions/version-compare-rows';
import { StepChangeKind } from '@/features/releases/utils/version-diff';

const DATE = '2026-10-30T00:00:00.000Z';

const context: CompareContext = {
  propsOf: () => ({
    chat_id: { displayName: 'Group' },
    msg_type: {
      displayName: 'Message type',
      options: {
        disabled: false,
        options: [
          { label: 'Text', value: 'text' },
          { label: 'Card', value: 'interactive' },
        ],
      },
    },
  }),
  connectorName: (name) =>
    name === '@fema-ipaas/connector-feishu' ? 'Feishu' : null,
  operationName: ({ name }) => (name === 'send' ? 'Send message' : null),
  componentName: (type) => (type === 'runtime/delay' ? 'Delay' : null),
  stepNames: { trigger: 'Employee changed', step_1: 'Roster row' },
  connectionNames: { feishu_bot: 'Feishu bot' },
};

function send({
  input,
  continueOnFailure,
}: {
  input: Record<string, unknown>;
  continueOnFailure: boolean;
}): WorkflowAction {
  return {
    name: 'step_2',
    type: WorkflowActionType.CONNECTOR,
    valid: true,
    displayName: 'Send group message',
    lastUpdatedDate: DATE,
    settings: {
      connectorName: '@fema-ipaas/connector-feishu',
      connectorVersion: '0.0.1',
      actionName: 'send',
      input,
      propertySettings: {
        chat_id: { type: PropertyExecutionType.MANUAL },
      },
      errorHandlingOptions: {
        continueOnFailure: { value: continueOnFailure },
        retryOnFailure: { value: false },
      },
    },
  };
}

describe('versionCompareRows.stepRows', () => {
  it('labels changed fields by their names and translates values', () => {
    const rows = versionCompareRows.stepRows({
      kind: StepChangeKind.MODIFIED,
      before: send({
        input: { chat_id: 'oc_1', msg_type: 'text' },
        continueOnFailure: false,
      }),
      after: send({
        input: {
          chat_id: 'oc_2',
          msg_type: 'interactive',
          content: "Hello {{step_1['output']['name']}}",
        },
        continueOnFailure: true,
      }),
      context,
    });
    expect(
      rows.map((row) => [row.group, row.label, row.before, row.after]),
    ).toEqual([
      [CompareGroup.INPUT, 'Group', 'oc_1', 'oc_2'],
      [CompareGroup.INPUT, 'content', '—', 'Hello {「Roster row」.name}'],
      [CompareGroup.INPUT, 'Message type', 'Text', 'Card'],
      [
        CompareGroup.ERROR_HANDLING,
        'Error handling · Add a failure branch',
        'No',
        'Yes',
      ],
    ]);
    expect(rows.some((row) => row.label.includes('settings.'))).toBe(false);
  });

  it('leaves default values out when a step is added', () => {
    const rows = versionCompareRows.stepRows({
      kind: StepChangeKind.ADDED,
      before: null,
      after: send({
        input: { auth: "{{connections['feishu_bot']}}", chat_id: 'oc_1' },
        continueOnFailure: false,
      }),
      context,
    });
    expect(rows.map((row) => [row.label, row.after])).toEqual([
      ['Step name', 'Send group message'],
      ['Operation', 'Send message'],
      ['Connector', 'Feishu'],
      ['Connector version', '0.0.1'],
      ['Step type', 'Connector'],
      ['Connection', 'Connection Feishu bot'],
      ['Group', 'oc_1'],
    ]);
  });

  it('summarises router branches and the branch mode', () => {
    const router = ({
      names,
      executionType,
    }: {
      names: string[];
      executionType: RouterExecutionType;
    }): WorkflowAction => ({
      name: 'step_3',
      type: WorkflowActionType.ROUTER,
      valid: true,
      displayName: 'By department',
      lastUpdatedDate: DATE,
      settings: {
        executionType,
        branches: [
          ...names.map(
            (branchName): RouterBranch => ({
              branchName,
              branchType: BranchExecutionType.CONDITION,
              conditions: [[]],
            }),
          ),
          { branchName: 'Otherwise', branchType: BranchExecutionType.FALLBACK },
        ],
      },
      children: [],
    });
    const rows = versionCompareRows.stepRows({
      kind: StepChangeKind.MODIFIED,
      before: router({
        names: ['R&D'],
        executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
      }),
      after: router({
        names: ['R&D', 'Sales'],
        executionType: RouterExecutionType.EXECUTE_ALL_MATCH,
      }),
      context,
    });
    expect(rows.map((row) => [row.label, row.before, row.after])).toEqual([
      [
        'Branches',
        'R&D (0 conditions)、Otherwise',
        'R&D (0 conditions)、Sales (0 conditions)、Otherwise',
      ],
      [
        'Which branches run',
        'Only the first (left) matching branch',
        'Run every matching branch',
      ],
    ]);
  });
});

describe('versionCompareRows.workflowRows', () => {
  it('names workflow level changes', () => {
    expect(
      versionCompareRows.workflowRows({
        changes: [
          { path: 'displayName', before: 'Old', after: 'New' },
          { path: 'stepOrder', before: 'A → B', after: 'B → A' },
        ],
      }),
    ).toEqual([
      {
        key: 'displayName',
        group: CompareGroup.BASIC,
        label: 'Workflow name',
        before: 'Old',
        after: 'New',
      },
      {
        key: 'stepOrder',
        group: CompareGroup.BASIC,
        label: 'Step order',
        before: 'A → B',
        after: 'B → A',
      },
    ]);
  });
});

type RouterBranch = RouterActionSettings['branches'][number];
