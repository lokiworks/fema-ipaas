import {
  StepLocationRelativeToParent,
  WorkflowAction,
  WorkflowActionType,
  WorkflowOperationRequest,
  WorkflowOperationType,
  WorkflowTriggerType,
  WorkflowVersion,
  WorkflowVersionState,
  workflowOperations,
  workflowStructureUtil,
} from '@fema-ipaas/shared';

import {
  UNDO_MAX_HISTORY,
  UndoEntry,
  undoHistory,
} from '@/app/builder/state/undo-history';

const DATE = '2026-05-02T00:00:00.000Z';

function action(name: string, text = ''): WorkflowAction {
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
      errorHandlingOptions: undefined,
    },
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
      type: WorkflowTriggerType.CONNECTOR,
      valid: true,
      displayName: 'Webhook',
      lastUpdatedDate: DATE,
      settings: {
        connectorName: '@fema-ipaas/connector-webhook',
        connectorVersion: '0.0.1',
        triggerName: 'catch',
        input: {},
        propertySettings: {},
      },
      nextAction,
    },
  };
}

function updateText(text: string): WorkflowOperationRequest {
  return {
    type: WorkflowOperationType.UPDATE_ACTION,
    request: action('step_1', text),
  };
}

function entry({
  before,
  operation,
  at,
}: {
  before: WorkflowVersion;
  operation: WorkflowOperationRequest;
  at: number;
}): UndoEntry {
  const after = workflowOperations.apply(before, operation);
  return {
    before,
    after,
    at,
    mergeKey: undoHistory.mergeKeyOf({ before, after, operation }),
  };
}

function replay({
  start,
  operations,
}: {
  start: WorkflowVersion;
  operations: WorkflowOperationRequest[];
}): WorkflowVersion {
  return operations.reduce(
    (current, operation) => workflowOperations.apply(current, operation),
    start,
  );
}

describe('undoHistory', () => {
  it('merges edits of the same field within one second', () => {
    const start = version(action('step_1'));
    const first = entry({ before: start, operation: updateText('a'), at: 0 });
    const second = entry({
      before: first.after,
      operation: updateText('ab'),
      at: 600,
    });
    const history = undoHistory.record({
      history: undoHistory.record({
        history: undoHistory.emptyHistory(),
        entry: first,
      }),
      entry: second,
    });
    expect(history.past).toHaveLength(1);
    expect(history.past[0].before).toBe(start);
    expect(history.past[0].after).toBe(second.after);
  });

  it('keeps separate entries after the merge window or for other fields', () => {
    const start = version(action('step_1'));
    const first = entry({ before: start, operation: updateText('a'), at: 0 });
    const late = entry({
      before: first.after,
      operation: updateText('ab'),
      at: 1500,
    });
    const rename = entry({
      before: late.after,
      operation: {
        type: WorkflowOperationType.UPDATE_ACTION,
        request: { ...action('step_1', 'ab'), displayName: 'Renamed' },
      },
      at: 1600,
    });
    const history = [first, late, rename].reduce(
      (acc, next) => undoHistory.record({ history: acc, entry: next }),
      undoHistory.emptyHistory(),
    );
    expect(history.past).toHaveLength(3);
  });

  it(`keeps only the last ${UNDO_MAX_HISTORY} entries and clears redo on a new edit`, () => {
    const start = version(action('step_1'));
    const entries = Array.from({ length: 50 }, (_, index) => ({
      ...entry({ before: start, operation: updateText(`${index}`), at: 0 }),
      mergeKey: null,
      at: index * 5000,
    }));
    const full = entries.reduce(
      (acc, next) => undoHistory.record({ history: acc, entry: next }),
      undoHistory.emptyHistory(),
    );
    expect(full.past).toHaveLength(UNDO_MAX_HISTORY);
    const { history: afterUndo } = undoHistory.takeUndo(full);
    expect(afterUndo.future).toHaveLength(1);
    const next = undoHistory.record({ history: afterUndo, entry: entries[0] });
    expect(next.future).toHaveLength(0);
  });

  it('undoes a field edit with a targeted update', () => {
    const start = version(action('step_1', 'old'));
    const edited = workflowOperations.apply(start, updateText('new'));
    const operations = undoHistory.operationsToReach({
      current: edited,
      target: start,
    });
    expect(operations.map((operation) => operation.type)).toEqual([
      WorkflowOperationType.UPDATE_ACTION,
    ]);
    const restored = replay({ start: edited, operations });
    expect(
      workflowStructureUtil.getStepOrThrow('step_1', restored.trigger).settings
        .input,
    ).toEqual({ text: 'old' });
  });

  it('undoes and redoes structural changes through an import', () => {
    const start = version(action('step_1', 'x'));
    const added = workflowOperations.apply(start, {
      type: WorkflowOperationType.ADD_ACTION,
      request: {
        parentStep: 'step_1',
        stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
        action: action('step_2', 'y'),
      },
    });
    const undo = undoHistory.operationsToReach({
      current: added,
      target: start,
    });
    expect(undo[0].type).toBe(WorkflowOperationType.IMPORT_WORKFLOW);
    const undone = replay({ start: added, operations: undo });
    expect(
      workflowStructureUtil
        .getAllSteps(undone.trigger)
        .map((step) => step.name),
    ).toEqual(['trigger', 'step_1']);
    const redo = undoHistory.operationsToReach({
      current: undone,
      target: added,
    });
    const redone = replay({ start: undone, operations: redo });
    expect(
      workflowStructureUtil
        .getAllSteps(redone.trigger)
        .map((step) => step.name),
    ).toEqual(['trigger', 'step_1', 'step_2']);
  });

  it('returns nothing when only derived fields differ', () => {
    const start = version(action('step_1', 'x'));
    const revalidated = workflowOperations.apply(start, {
      type: WorkflowOperationType.UPDATE_ACTION,
      request: { ...action('step_1', 'x'), valid: false },
    });
    expect(
      undoHistory.operationsToReach({ current: revalidated, target: start }),
    ).toEqual([]);
  });
});
