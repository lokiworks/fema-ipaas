/**
 * @vitest-environment jsdom
 */
import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowOperationType,
  WorkflowTriggerType,
  WorkflowVersion,
  WorkflowVersionState,
} from '@fema-ipaas/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { canvasBulkActions } from '@/app/builder/workflow-canvas/utils/bulk-actions';
import { useDeleteConfirmation } from '@/app/builder/workflow-canvas/utils/delete-confirmation-store';

const DATE = '2026-05-02T00:00:00.000Z';

function codeStep({
  name,
  input = {},
  nextAction,
}: {
  name: string;
  input?: Record<string, unknown>;
  nextAction?: WorkflowAction;
}): WorkflowAction {
  return {
    name,
    type: WorkflowActionType.CODE,
    valid: true,
    displayName: `Name ${name}`,
    lastUpdatedDate: DATE,
    settings: {
      sourceCode: { code: '', packageJson: '{}' },
      input,
      errorHandlingOptions: {},
    },
    nextAction,
  };
}

function versionWith(head: WorkflowAction): WorkflowVersion {
  return {
    id: 'version',
    created: DATE,
    updated: DATE,
    workflowId: 'workflow',
    displayName: 'Workflow',
    agentIds: [],
    connectionIds: [],
    state: WorkflowVersionState.DRAFT,
    valid: true,
    notes: [],
    schemaVersion: null,
    backupFiles: null,
    trigger: {
      name: 'trigger',
      type: WorkflowTriggerType.EMPTY,
      valid: true,
      displayName: 'Trigger',
      lastUpdatedDate: DATE,
      settings: {},
      nextAction: head,
    },
  };
}

describe('canvasBulkActions.cutSelectedNodes', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    writeText.mockClear();
    useDeleteConfirmation.getState().close();
  });

  afterEach(() => {
    useDeleteConfirmation.getState().close();
  });

  it('copies and removes a step nobody uses without asking', async () => {
    const applyOperation = vi.fn();
    await canvasBulkActions.cutSelectedNodes({
      selectedNodes: ['step_2'],
      workflowVersion: versionWith(
        codeStep({ name: 'step_1', nextAction: codeStep({ name: 'step_2' }) }),
      ),
      applyOperation,
      selectedStep: null,
      exitStepSettings: vi.fn(),
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(applyOperation).toHaveBeenCalledWith({
      type: WorkflowOperationType.DELETE_ACTION,
      request: { names: ['step_2'] },
    });
    expect(useDeleteConfirmation.getState().pending).toBeNull();
  });

  it('asks before removing a step whose output a later step reads', async () => {
    const applyOperation = vi.fn();
    await canvasBulkActions.cutSelectedNodes({
      selectedNodes: ['step_1'],
      workflowVersion: versionWith(
        codeStep({
          name: 'step_1',
          nextAction: codeStep({
            name: 'step_2',
            input: { text: '{{step_1.output.id}}' },
          }),
        }),
      ),
      applyOperation,
      selectedStep: null,
      exitStepSettings: vi.fn(),
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(applyOperation).not.toHaveBeenCalled();
    expect(useDeleteConfirmation.getState().pending?.dependents).toEqual([
      { name: 'step_2', displayName: 'Name step_2' },
    ]);
  });
});
