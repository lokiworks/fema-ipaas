import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';

import { versionDiff } from '@/features/releases/utils/version-diff';

function step({
  text,
  displayNumber,
}: {
  text: string;
  displayNumber?: string;
}): WorkflowAction {
  return {
    name: 'step_1',
    type: WorkflowActionType.CONNECTOR,
    valid: true,
    displayName: 'Send',
    lastUpdatedDate: '2026-05-02T00:00:00.000Z',
    settings: {
      connectorName: '@fema-ipaas/connector-feishu',
      connectorVersion: '0.0.1',
      actionName: 'send',
      input: { text, chat: 'ops' },
      propertySettings: {},
      errorHandlingOptions: undefined,
      ...(displayNumber ? { displayNumber } : {}),
    },
  };
}

describe('versionDiff.fieldChanges', () => {
  it('lists changed leaf fields with before and after values', () => {
    expect(
      versionDiff.fieldChanges({
        before: step({ text: 'old' }),
        after: step({ text: 'new' }),
      }),
    ).toEqual([{ path: 'settings.input.text', before: 'old', after: 'new' }]);
  });

  it('ignores derived fields such as display numbers', () => {
    expect(
      versionDiff.fieldChanges({
        before: step({ text: 'same' }),
        after: step({ text: 'same', displayNumber: 'feishu-1' }),
      }),
    ).toEqual([]);
    expect(
      versionDiff.diffSteps({
        before: null,
        after: {
          name: 'trigger',
          type: WorkflowTriggerType.EMPTY,
          valid: false,
          displayName: 'Trigger',
          lastUpdatedDate: '2026-05-02T00:00:00.000Z',
          settings: {},
        },
      }),
    ).toHaveLength(1);
  });

  it('shows every field of an added step as new', () => {
    const changes = versionDiff.fieldChanges({
      before: null,
      after: step({ text: 'hi' }),
    });
    expect(
      changes.find((change) => change.path === 'settings.input.text'),
    ).toEqual({
      path: 'settings.input.text',
      before: null,
      after: 'hi',
    });
  });
});
