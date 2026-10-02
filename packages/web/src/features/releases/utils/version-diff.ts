import {
  WorkflowAction,
  WorkflowTrigger,
  WorkflowVersion,
  workflowStructureUtil,
} from '@fema-ipaas/shared';

function hasChanges({
  before,
  after,
}: {
  before: WorkflowVersion;
  after: WorkflowVersion;
}): boolean {
  if (before.displayName !== after.displayName) {
    return true;
  }
  const beforeNames = stepNames(before.trigger);
  const afterNames = stepNames(after.trigger);
  if (beforeNames.join('|') !== afterNames.join('|')) {
    return true;
  }
  return diffSteps({ before: before.trigger, after: after.trigger }).length > 0;
}

function workflowChanges({
  before,
  after,
}: {
  before: WorkflowVersion;
  after: WorkflowVersion;
}): FieldChange[] {
  const nameChange: FieldChange[] =
    before.displayName === after.displayName
      ? []
      : [
          {
            path: 'displayName',
            before: before.displayName,
            after: after.displayName,
          },
        ];
  const beforeOrder = sharedSteps({ own: before, other: after });
  const afterOrder = sharedSteps({ own: after, other: before });
  const orderChange: FieldChange[] =
    beforeOrder.map((step) => step.name).join('|') ===
    afterOrder.map((step) => step.name).join('|')
      ? []
      : [
          {
            path: 'stepOrder',
            before: beforeOrder.map((step) => step.displayName).join(' → '),
            after: afterOrder.map((step) => step.displayName).join(' → '),
          },
        ];
  return [...nameChange, ...orderChange];
}

function sharedSteps({
  own,
  other,
}: {
  own: WorkflowVersion;
  other: WorkflowVersion;
}): { name: string; displayName: string }[] {
  const otherNames = new Set(stepNames(other.trigger));
  return workflowStructureUtil
    .getAllSteps(own.trigger)
    .filter((step) => otherNames.has(step.name))
    .map((step) => ({ name: step.name, displayName: step.displayName }));
}

function stepNames(trigger: WorkflowTrigger): string[] {
  return workflowStructureUtil.getAllSteps(trigger).map((step) => step.name);
}

function diffSteps({
  before,
  after,
}: {
  before: WorkflowTrigger | null;
  after: WorkflowTrigger;
}): StepChange[] {
  const beforeSteps = new Map(
    (before ? workflowStructureUtil.getAllSteps(before) : []).map((step) => [
      step.name,
      step,
    ]),
  );
  const afterSteps = new Map(
    workflowStructureUtil.getAllSteps(after).map((step) => [step.name, step]),
  );
  const added = [...afterSteps.values()]
    .filter((step) => !beforeSteps.has(step.name))
    .map((step) => change({ kind: StepChangeKind.ADDED, step }));
  const removed = [...beforeSteps.values()]
    .filter((step) => !afterSteps.has(step.name))
    .map((step) => change({ kind: StepChangeKind.REMOVED, step }));
  const modified = [...afterSteps.values()]
    .filter((step) => {
      const previous = beforeSteps.get(step.name);
      return !!previous && signature(previous) !== signature(step);
    })
    .map((step) => change({ kind: StepChangeKind.MODIFIED, step }));
  return [...added, ...modified, ...removed];
}

function signature(step: WorkflowTrigger | WorkflowAction): string {
  return JSON.stringify(sortKeys(comparable(step)));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortKeys(child)]),
    );
  }
  return value;
}

function fieldChanges({
  before,
  after,
}: {
  before: WorkflowTrigger | WorkflowAction | null;
  after: WorkflowTrigger | WorkflowAction | null;
}): FieldChange[] {
  const beforeFields = flatten({
    value: before ? comparable(before) : {},
    prefix: '',
  });
  const afterFields = flatten({
    value: after ? comparable(after) : {},
    prefix: '',
  });
  const paths = [
    ...new Set([...Object.keys(beforeFields), ...Object.keys(afterFields)]),
  ].sort();
  return paths
    .filter((path) => beforeFields[path] !== afterFields[path])
    .map((path) => ({
      path,
      before: beforeFields[path] ?? null,
      after: afterFields[path] ?? null,
    }));
}

function comparable(step: WorkflowTrigger | WorkflowAction): unknown {
  const {
    sampleData: _sampleData,
    displayNumber: _displayNumber,
    pendingReview: _pendingReview,
    ...settings
  } = readRecord(step.settings);
  return JSON.parse(
    JSON.stringify({
      type: step.type,
      displayName: step.displayName,
      settings,
      skip: 'skip' in step ? step.skip : undefined,
    }),
  );
}

function flatten({
  value,
  prefix,
}: {
  value: unknown;
  prefix: string;
}): Record<string, string> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.entries(value).reduce<Record<string, string>>(
      (acc, [key, child]) => ({
        ...acc,
        ...flatten({
          value: child,
          prefix: prefix.length === 0 ? key : `${prefix}.${key}`,
        }),
      }),
      {},
    );
  }
  return {
    [prefix]: typeof value === 'string' ? value : JSON.stringify(value),
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function change({
  kind,
  step,
}: {
  kind: StepChangeKind;
  step: WorkflowTrigger | WorkflowAction;
}): StepChange {
  return { kind, name: step.name, displayName: step.displayName };
}

export enum StepChangeKind {
  ADDED = 'ADDED',
  MODIFIED = 'MODIFIED',
  REMOVED = 'REMOVED',
}

export const versionDiff = {
  hasChanges,
  diffSteps,
  fieldChanges,
  workflowChanges,
};

export type StepChange = {
  kind: StepChangeKind;
  name: string;
  displayName: string;
};

export type FieldChange = {
  path: string;
  before: string | null;
  after: string | null;
};
