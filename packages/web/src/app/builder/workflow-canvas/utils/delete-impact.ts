import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowActionType,
  WorkflowTrigger,
  workflowReferenceUtil,
  workflowStructureUtil,
} from '@fema-ipaas/shared';

function impactOf({ trigger, names }: ImpactParams): DeleteImpact {
  const removedNames = unique(
    names.flatMap((name) => {
      const step = workflowStructureUtil.getStep(name, trigger);
      return isNil(step)
        ? []
        : workflowStructureUtil
            .getAllSteps({ ...step, nextAction: undefined })
            .map((inner) => inner.name);
    }),
  );
  const dependents = dependentsOf({ trigger, removedNames });
  return {
    names,
    nestedCount: removedNames.length - names.length,
    dependents,
    branch: null,
  };
}

function branchImpactOf({
  trigger,
  stepName,
  branchIndex,
}: BranchImpactParams): DeleteImpact {
  const router = workflowStructureUtil.getStep(stepName, trigger);
  const head =
    !isNil(router) &&
    (router.type === WorkflowActionType.ROUTER ||
      router.type === WorkflowActionType.PARALLEL)
      ? router.children[branchIndex]
      : null;
  const removedSteps = isNil(head)
    ? []
    : workflowStructureUtil
        .getAllSteps(head)
        .map((step) => ({ name: step.name, displayName: step.displayName }));
  const removedNames = removedSteps.map((step) => step.name);
  return {
    names: removedNames,
    nestedCount: 0,
    dependents: dependentsOf({ trigger, removedNames }),
    branch: { stepName, branchIndex, removedSteps },
  };
}

function needsConfirmation({ impact }: { impact: DeleteImpact }): boolean {
  return (
    impact.nestedCount > 0 ||
    impact.dependents.length > 0 ||
    (impact.branch?.removedSteps.length ?? 0) > 0
  );
}

function dependentsOf({
  trigger,
  removedNames,
}: {
  trigger: WorkflowTrigger;
  removedNames: string[];
}): { name: string; displayName: string }[] {
  return workflowStructureUtil
    .getAllSteps(trigger)
    .filter((step) => !removedNames.includes(step.name))
    .filter((step) =>
      referencedRoots(step.settings).some((root) =>
        removedNames.includes(root),
      ),
    )
    .map((step) => ({ name: step.name, displayName: step.displayName }));
}

function referencedRoots(settings: unknown): string[] {
  if (typeof settings !== 'object' || settings === null) {
    return [];
  }
  const values = REFERENCE_SETTINGS.map((key) =>
    key in settings ? Reflect.get(settings, key) : undefined,
  );
  return workflowReferenceUtil
    .extractFromValue(values)
    .map((reference) => reference.root);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export const deleteImpactUtils = {
  impactOf,
  branchImpactOf,
  needsConfirmation,
};

const REFERENCE_SETTINGS = ['input', 'items', 'branches'];

export type DeleteImpact = {
  names: string[];
  nestedCount: number;
  dependents: { name: string; displayName: string }[];
  branch: {
    stepName: string;
    branchIndex: number;
    removedSteps: { name: string; displayName: string }[];
  } | null;
};

type BranchImpactParams = {
  trigger: WorkflowTrigger;
  stepName: string;
  branchIndex: number;
};

type ImpactParams = {
  trigger: WorkflowTrigger;
  names: string[];
};
