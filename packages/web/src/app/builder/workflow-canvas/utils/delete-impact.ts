import { isNil } from '@fema-ipaas/core-utils';
import {
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
  const dependents = workflowStructureUtil
    .getAllSteps(trigger)
    .filter((step) => !removedNames.includes(step.name))
    .filter((step) =>
      referencedRoots(step.settings).some((root) =>
        removedNames.includes(root),
      ),
    )
    .map((step) => ({ name: step.name, displayName: step.displayName }));
  return {
    names,
    nestedCount: removedNames.length - names.length,
    dependents,
  };
}

function needsConfirmation({ impact }: { impact: DeleteImpact }): boolean {
  return impact.nestedCount > 0 || impact.dependents.length > 0;
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

export const deleteImpactUtils = { impactOf, needsConfirmation };

const REFERENCE_SETTINGS = ['input', 'items', 'branches'];

export type DeleteImpact = {
  names: string[];
  nestedCount: number;
  dependents: { name: string; displayName: string }[];
};

type ImpactParams = {
  trigger: WorkflowTrigger;
  names: string[];
};
