import {
  WorkflowAction,
  WorkflowTrigger,
  workflowStructureUtil,
} from '@fema-ipaas/shared';

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
  return JSON.stringify({
    type: step.type,
    displayName: step.displayName,
    settings: step.settings,
    skip: 'skip' in step ? step.skip : undefined,
  });
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
  diffSteps,
};

export type StepChange = {
  kind: StepChangeKind;
  name: string;
  displayName: string;
};
