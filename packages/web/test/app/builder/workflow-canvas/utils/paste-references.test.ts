import {
  StepLocationRelativeToParent,
  WorkflowAction,
  WorkflowActionType,
  WorkflowTriggerType,
  WorkflowVersion,
  WorkflowVersionState,
  workflowOperations,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { describe, expect, it, vi } from 'vitest';

vi.mock('i18next', () => ({ t: (key: string) => key }));

import { pasteReferences } from '@/app/builder/workflow-canvas/utils/paste-references';

const DATE = '2026-05-02T00:00:00.000Z';

function action({
  name,
  text,
  nextAction,
}: {
  name: string;
  text: string;
  nextAction?: WorkflowAction;
}): WorkflowAction {
  return {
    name,
    type: WorkflowActionType.CONNECTOR,
    valid: true,
    displayName: name,
    lastUpdatedDate: DATE,
    settings: {
      connectorName: '@fema-ipaas/connector-feishu',
      connectorVersion: '0.0.1',
      actionName: 'send',
      input: { text },
      propertySettings: {},
    },
    nextAction,
  };
}

function version(nextAction?: WorkflowAction): WorkflowVersion {
  return {
    id: 'v1',
    created: DATE,
    updated: DATE,
    workflowId: 'w1',
    updatedBy: null,
    displayName: 'Flow',
    valid: true,
    agentIds: [],
    connectionIds: [],
    state: WorkflowVersionState.DRAFT,
    notes: [],
    schemaVersion: null,
    backupFiles: null,
    graph: null,
    publishNote: null,
    trigger: {
      name: 'trigger',
      type: WorkflowTriggerType.EMPTY,
      valid: true,
      displayName: 'Trigger',
      lastUpdatedDate: DATE,
      settings: {},
      nextAction,
    },
  };
}

function paste({
  clipboard,
  target,
}: {
  clipboard: WorkflowAction[];
  target: WorkflowVersion;
}) {
  const before = pasteReferences.clearMissingBeforePaste({
    actions: clipboard,
    workflowVersion: target,
  });
  const after = pasteReferences.clearNonUpstreamAfterPaste({
    operations: workflowOperations.getOperationsForPaste(
      before.actions,
      target,
      {
        parentStepName: 'step_1',
        stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
      },
      'Copy',
    ),
    workflowVersion: target,
  });
  const result = after.operations.reduce(
    (current, operation) => workflowOperations.apply(current, operation),
    target,
  );
  return {
    clearedCount: before.clearedCount + after.clearedCount,
    inputs: workflowStructureUtil
      .getAllSteps(result.trigger)
      .slice(2)
      .map((step) =>
        'input' in step.settings ? step.settings.input['text'] : undefined,
      ),
  };
}

describe('pasteReferences', () => {
  it('rewrites references between pasted steps to their new names', () => {
    const target = version(action({ name: 'step_1', text: 'start' }));
    const result = paste({
      clipboard: [
        action({
          name: 'step_7',
          text: 'first',
          nextAction: action({
            name: 'step_8',
            text: 'Hello {{step_7.output.name}}',
          }),
        }),
      ],
      target,
    });
    expect(result.clearedCount).toBe(0);
    expect(result.inputs).toEqual(['first', 'Hello {{step_2.output.name}}']);
  });

  it('clears references to upstream steps that do not exist in the target', () => {
    const target = version(action({ name: 'step_1', text: 'start' }));
    const result = paste({
      clipboard: [
        action({
          name: 'step_3',
          text: "Name: {{step_2['output']['name']}} · {{trigger.body.id}}",
        }),
      ],
      target,
    });
    expect(result.clearedCount).toBe(1);
    expect(result.inputs).toEqual(['Name:  · {{trigger.body.id}}']);
  });

  it('keeps references to existing upstream steps in the same workflow', () => {
    const copied = action({ name: 'step_2', text: '{{step_1.output.id}}' });
    const target = version(
      action({ name: 'step_1', text: 'start', nextAction: copied }),
    );
    const result = paste({ clipboard: [copied], target });
    expect(result.clearedCount).toBe(0);
    expect(result.inputs).toEqual([
      '{{step_1.output.id}}',
      '{{step_1.output.id}}',
    ]);
  });
});
