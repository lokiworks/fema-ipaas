import { isNil } from '@fema-ipaas/core-utils';
import {
  LATEST_WORKFLOW_SCHEMA_VERSION,
  Note,
  WorkflowAction,
  WorkflowActionType,
  WorkflowOperationRequest,
  WorkflowOperationType,
  WorkflowTrigger,
  WorkflowTriggerType,
  WorkflowVersion,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import deepEqual from 'deep-equal';

function emptyHistory(): UndoHistory {
  return { past: [], future: [] };
}

function isUndoable(operation: WorkflowOperationRequest): boolean {
  return UNDOABLE_OPERATIONS.includes(operation.type);
}

function record({
  history,
  entry,
}: {
  history: UndoHistory;
  entry: UndoEntry;
}): UndoHistory {
  const last = history.past.at(-1);
  const canMerge =
    !isNil(last) &&
    !isNil(entry.mergeKey) &&
    last.mergeKey === entry.mergeKey &&
    entry.at - last.at <= MERGE_WINDOW_MS;
  if (canMerge && !isNil(last)) {
    const merged: UndoEntry = {
      ...last,
      after: entry.after,
      at: entry.at,
    };
    return { past: [...history.past.slice(0, -1), merged], future: [] };
  }
  const past = [...history.past, entry];
  return {
    past:
      past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past,
    future: [],
  };
}

function takeUndo(history: UndoHistory): {
  history: UndoHistory;
  entry: UndoEntry | null;
} {
  const entry = history.past.at(-1);
  if (isNil(entry)) {
    return { history, entry: null };
  }
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, entry],
    },
    entry,
  };
}

function takeRedo(history: UndoHistory): {
  history: UndoHistory;
  entry: UndoEntry | null;
} {
  const entry = history.future.at(-1);
  if (isNil(entry)) {
    return { history, entry: null };
  }
  return {
    history: {
      past: [...history.past, entry],
      future: history.future.slice(0, -1),
    },
    entry,
  };
}

function mergeKeyOf({
  before,
  after,
  operation,
}: {
  before: WorkflowVersion;
  after: WorkflowVersion;
  operation: WorkflowOperationRequest;
}): string | null {
  switch (operation.type) {
    case WorkflowOperationType.UPDATE_ACTION:
    case WorkflowOperationType.UPDATE_TRIGGER: {
      const name = operation.request.name;
      const previous = workflowStructureUtil.getStep(name, before.trigger);
      const next = workflowStructureUtil.getStep(name, after.trigger);
      if (isNil(previous) || isNil(next)) {
        return null;
      }
      const fields = changedFields({
        before: comparableStep(previous),
        after: comparableStep(next),
        prefix: '',
      });
      return `${name}:${fields.join(',')}`;
    }
    case WorkflowOperationType.CHANGE_NAME:
      return 'workflow:displayName';
    case WorkflowOperationType.UPDATE_NOTE:
      return `note:${operation.request.id}`;
    default:
      return null;
  }
}

function operationsToReach({
  current,
  target,
}: {
  current: WorkflowVersion;
  target: WorkflowVersion;
}): WorkflowOperationRequest[] {
  if (shapeOf(current.trigger) !== shapeOf(target.trigger)) {
    return [
      importOperation(target),
      ...joinEdgeOperations({ current, target }),
    ];
  }
  const currentSteps = new Map(
    workflowStructureUtil
      .getAllSteps(current.trigger)
      .map((step) => [step.name, step]),
  );
  const stepOperations = workflowStructureUtil
    .getAllSteps(target.trigger)
    .flatMap((step) => {
      const existing = currentSteps.get(step.name);
      if (
        !isNil(existing) &&
        deepEqual(comparableStep(existing), comparableStep(step))
      ) {
        return [];
      }
      return [updateOperation(step)];
    });
  const nameOperations: WorkflowOperationRequest[] =
    current.displayName === target.displayName
      ? []
      : [
          {
            type: WorkflowOperationType.CHANGE_NAME,
            request: { displayName: target.displayName },
          },
        ];
  return [
    ...nameOperations,
    ...stepOperations,
    ...noteOperations({ current: current.notes, target: target.notes }),
    ...joinEdgeOperations({ current, target }),
  ];
}

function updateOperation(
  step: WorkflowAction | WorkflowTrigger,
): WorkflowOperationRequest {
  if (
    step.type === WorkflowTriggerType.CONNECTOR ||
    step.type === WorkflowTriggerType.EMPTY
  ) {
    const { nextAction: _nextAction, lastUpdatedDate: _date, ...rest } = step;
    return { type: WorkflowOperationType.UPDATE_TRIGGER, request: rest };
  }
  return {
    type: WorkflowOperationType.UPDATE_ACTION,
    request: actionRequest(step),
  };
}

function actionRequest(step: WorkflowAction) {
  const base = {
    name: step.name,
    displayName: step.displayName,
    valid: step.valid,
    skip: step.skip,
  };
  switch (step.type) {
    case WorkflowActionType.CODE:
      return { ...base, type: step.type, settings: step.settings };
    case WorkflowActionType.CONNECTOR:
      return { ...base, type: step.type, settings: step.settings };
    case WorkflowActionType.COMPONENT:
      return { ...base, type: step.type, settings: step.settings };
    case WorkflowActionType.LOOP_ON_ITEMS:
      return { ...base, type: step.type, settings: step.settings };
    case WorkflowActionType.ROUTER:
      return { ...base, type: step.type, settings: step.settings };
    case WorkflowActionType.PARALLEL:
      return { ...base, type: step.type, settings: step.settings };
  }
}

function importOperation(target: WorkflowVersion): WorkflowOperationRequest {
  return {
    type: WorkflowOperationType.IMPORT_WORKFLOW,
    request: {
      displayName: target.displayName,
      trigger: target.trigger,
      schemaVersion: target.schemaVersion ?? LATEST_WORKFLOW_SCHEMA_VERSION,
      notes: target.notes,
    },
  };
}

function joinEdgeOperations({
  current,
  target,
}: {
  current: WorkflowVersion;
  target: WorkflowVersion;
}): WorkflowOperationRequest[] {
  const currentEdges = current.graph?.joinEdges ?? [];
  const targetEdges = target.graph?.joinEdges ?? [];
  if (deepEqual(currentEdges, targetEdges)) {
    return [];
  }
  return [
    {
      type: WorkflowOperationType.SET_JOIN_EDGES,
      request: { joinEdges: targetEdges },
    },
  ];
}

function noteOperations({
  current,
  target,
}: {
  current: Note[];
  target: Note[];
}): WorkflowOperationRequest[] {
  const currentById = new Map(current.map((note) => [note.id, note]));
  const targetIds = new Set(target.map((note) => note.id));
  const deletions: WorkflowOperationRequest[] = current
    .filter((note) => !targetIds.has(note.id))
    .map((note) => ({
      type: WorkflowOperationType.DELETE_NOTE,
      request: { id: note.id },
    }));
  const upserts = target.flatMap((note): WorkflowOperationRequest[] => {
    const existing = currentById.get(note.id);
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...request } = note;
    if (isNil(existing)) {
      const { ownerId: _ownerId, ...addRequest } = request;
      return [{ type: WorkflowOperationType.ADD_NOTE, request: addRequest }];
    }
    const { createdAt: _a, updatedAt: _b, ...existingRequest } = existing;
    return deepEqual(existingRequest, request)
      ? []
      : [{ type: WorkflowOperationType.UPDATE_NOTE, request }];
  });
  return [...deletions, ...upserts];
}

function shapeOf(
  step: WorkflowAction | WorkflowTrigger | null | undefined,
): string {
  if (isNil(step)) {
    return '-';
  }
  const children = childrenOf(step).map(shapeOf).join(',');
  return `${step.name}:${step.type}[${children}]>${shapeOf(step.nextAction)}`;
}

function childrenOf(
  step: WorkflowAction | WorkflowTrigger,
): (WorkflowAction | null | undefined)[] {
  switch (step.type) {
    case WorkflowActionType.LOOP_ON_ITEMS:
      return [step.firstLoopAction];
    case WorkflowActionType.ROUTER:
    case WorkflowActionType.PARALLEL:
      return step.children;
    case WorkflowActionType.CODE:
    case WorkflowActionType.CONNECTOR:
    case WorkflowActionType.COMPONENT:
      return [
        step.continueOnFailureBranches?.onSuccess,
        step.continueOnFailureBranches?.onFailure,
      ];
    default:
      return [];
  }
}

function comparableStep(step: WorkflowAction | WorkflowTrigger): unknown {
  const {
    sampleData: _sampleData,
    displayNumber: _displayNumber,
    ...settings
  } = readRecord(step.settings);
  return JSON.parse(
    JSON.stringify({
      name: step.name,
      type: step.type,
      displayName: step.displayName,
      skip: 'skip' in step ? step.skip === true : false,
      settings,
    }),
  );
}

function changedFields({
  before,
  after,
  prefix,
}: {
  before: unknown;
  after: unknown;
  prefix: string;
}): string[] {
  if (deepEqual(before, after)) {
    return [];
  }
  const beforeRecord = isRecord(before) ? before : null;
  const afterRecord = isRecord(after) ? after : null;
  if (isNil(beforeRecord) || isNil(afterRecord)) {
    return [prefix];
  }
  const keys = [
    ...new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]),
  ].sort();
  return keys.flatMap((key) =>
    changedFields({
      before: beforeRecord[key],
      after: afterRecord[key],
      prefix: prefix.length === 0 ? key : `${prefix}.${key}`,
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && !isNil(value) && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export const undoHistory = {
  emptyHistory,
  isUndoable,
  record,
  takeUndo,
  takeRedo,
  mergeKeyOf,
  operationsToReach,
};

export const UNDO_MAX_HISTORY = 41;
const MAX_HISTORY = UNDO_MAX_HISTORY;
const MERGE_WINDOW_MS = 1000;
const UNDOABLE_OPERATIONS: WorkflowOperationType[] = [
  WorkflowOperationType.MOVE_ACTION,
  WorkflowOperationType.CHANGE_NAME,
  WorkflowOperationType.IMPORT_WORKFLOW,
  WorkflowOperationType.UPDATE_TRIGGER,
  WorkflowOperationType.ADD_ACTION,
  WorkflowOperationType.UPDATE_ACTION,
  WorkflowOperationType.DELETE_ACTION,
  WorkflowOperationType.DUPLICATE_ACTION,
  WorkflowOperationType.DELETE_BRANCH,
  WorkflowOperationType.ADD_BRANCH,
  WorkflowOperationType.DUPLICATE_BRANCH,
  WorkflowOperationType.SET_SKIP_ACTION,
  WorkflowOperationType.SET_JOIN_EDGES,
  WorkflowOperationType.MOVE_BRANCH,
  WorkflowOperationType.UPDATE_NOTE,
  WorkflowOperationType.DELETE_NOTE,
  WorkflowOperationType.ADD_NOTE,
];

export type UndoEntry = {
  before: WorkflowVersion;
  after: WorkflowVersion;
  mergeKey: string | null;
  at: number;
};

export type UndoHistory = {
  past: UndoEntry[];
  future: UndoEntry[];
};
