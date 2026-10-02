import { isNil } from '@fema-ipaas/core-utils';
import {
  PasteLocation,
  StepLocationRelativeToParent,
  WorkflowActionType,
  WorkflowTrigger,
  workflowStructureUtil,
} from '@fema-ipaas/shared';

function before({
  trigger,
  stepName,
}: {
  trigger: WorkflowTrigger;
  stepName: string;
}): PasteLocation | null {
  const matches = workflowStructureUtil
    .getAllSteps(trigger)
    .flatMap((step): PasteLocation[] => {
      if (step.nextAction?.name === stepName) {
        return [
          {
            parentStepName: step.name,
            stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
          },
        ];
      }
      switch (step.type) {
        case WorkflowActionType.LOOP_ON_ITEMS:
          return step.firstLoopAction?.name === stepName
            ? [
                {
                  parentStepName: step.name,
                  stepLocationRelativeToParent:
                    StepLocationRelativeToParent.INSIDE_LOOP,
                },
              ]
            : [];
        case WorkflowActionType.ROUTER:
        case WorkflowActionType.PARALLEL: {
          const branchIndex = step.children.findIndex(
            (child) => child?.name === stepName,
          );
          return branchIndex === -1
            ? []
            : [
                {
                  parentStepName: step.name,
                  stepLocationRelativeToParent:
                    StepLocationRelativeToParent.INSIDE_BRANCH,
                  branchIndex,
                },
              ];
        }
        case WorkflowActionType.CODE:
        case WorkflowActionType.CONNECTOR: {
          const branches = step.continueOnFailureBranches;
          if (branches?.onSuccess?.name === stepName) {
            return [
              {
                parentStepName: step.name,
                stepLocationRelativeToParent:
                  StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH,
              },
            ];
          }
          if (branches?.onFailure?.name === stepName) {
            return [
              {
                parentStepName: step.name,
                stepLocationRelativeToParent:
                  StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH,
              },
            ];
          }
          return [];
        }
        default:
          return [];
      }
    });
  return matches[0] ?? null;
}

function after(stepName: string): PasteLocation {
  return {
    parentStepName: stepName,
    stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
  };
}

function isValid({
  trigger,
  location,
}: {
  trigger: WorkflowTrigger;
  location: PasteLocation | null;
}): boolean {
  return (
    !isNil(location) &&
    !isNil(workflowStructureUtil.getStep(location.parentStepName, trigger))
  );
}

export const pasteLocationUtils = {
  before,
  after,
  isValid,
};
