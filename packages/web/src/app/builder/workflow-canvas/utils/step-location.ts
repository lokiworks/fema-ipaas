import { isNil } from '@fema-ipaas/core-utils';
import {
  Step,
  WorkflowActionType,
  WorkflowTrigger,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

function locate({
  trigger,
  stepName,
}: {
  trigger: WorkflowTrigger;
  stepName: string;
}): StepLocation | null {
  const ordinal = workflowStructureUtil.getStepNumber(trigger, stepName);
  if (ordinal === 0) {
    return null;
  }
  return {
    ordinal,
    path: findPath({ step: trigger, stepName, path: [] }) ?? [],
  };
}

function label({
  trigger,
  stepName,
}: {
  trigger: WorkflowTrigger;
  stepName: string;
}): string {
  const location = locate({ trigger, stepName });
  if (isNil(location)) {
    return '';
  }
  const ordinal = t('Step {position}', { position: location.ordinal });
  if (location.path.length === 0) {
    return ordinal;
  }
  return `${ordinal} · ${location.path.map(segmentLabel).join(' / ')}`;
}

function segmentLabel(segment: StepLocationSegment): string {
  switch (segment.kind) {
    case StepLocationKind.BRANCH:
      return t('{step} branch {branch}', {
        step: segment.stepDisplayName,
        branch: segment.branchName,
      });
    case StepLocationKind.LOOP:
      return t('Inside loop {step}', { step: segment.stepDisplayName });
    case StepLocationKind.ON_SUCCESS:
      return t('{step} branch {branch}', {
        step: segment.stepDisplayName,
        branch: t('Success'),
      });
    case StepLocationKind.ON_FAILURE:
      return t('{step} branch {branch}', {
        step: segment.stepDisplayName,
        branch: t('On failure'),
      });
  }
}

function branchLabel({
  name,
  index,
}: {
  name: string | undefined;
  index: number;
}): string {
  if (isNil(name) || name.trim().length === 0) {
    return t('Branch {index}', { index: index + 1 });
  }
  return name === OTHERWISE_BRANCH_NAME ? t('Otherwise') : name;
}

function findPath({
  step,
  stepName,
  path,
}: {
  step: Step | null | undefined;
  stepName: string;
  path: StepLocationSegment[];
}): StepLocationSegment[] | null {
  if (isNil(step)) {
    return null;
  }
  if (step.name === stepName) {
    return path;
  }
  const inside = childScopes(step)
    .map((scope) =>
      findPath({
        step: scope.first,
        stepName,
        path: [...path, scope.segment],
      }),
    )
    .find((found) => !isNil(found));
  if (!isNil(inside)) {
    return inside;
  }
  return 'nextAction' in step
    ? findPath({ step: step.nextAction, stepName, path })
    : null;
}

function childScopes(step: Step): ChildScope[] {
  switch (step.type) {
    case WorkflowActionType.LOOP_ON_ITEMS:
      return [
        {
          first: step.firstLoopAction,
          segment: {
            kind: StepLocationKind.LOOP,
            stepDisplayName: step.displayName,
          },
        },
      ];
    case WorkflowActionType.ROUTER:
    case WorkflowActionType.PARALLEL:
      return step.children.map((child, index) => ({
        first: child,
        segment: {
          kind: StepLocationKind.BRANCH,
          stepDisplayName: step.displayName,
          branchName: branchLabel({
            name: step.settings.branches[index]?.branchName,
            index,
          }),
        },
      }));
    case WorkflowActionType.CODE:
    case WorkflowActionType.CONNECTOR:
      return [
        {
          first: step.continueOnFailureBranches?.onSuccess,
          segment: {
            kind: StepLocationKind.ON_SUCCESS,
            stepDisplayName: step.displayName,
          },
        },
        {
          first: step.continueOnFailureBranches?.onFailure,
          segment: {
            kind: StepLocationKind.ON_FAILURE,
            stepDisplayName: step.displayName,
          },
        },
      ];
    default:
      return [];
  }
}

const OTHERWISE_BRANCH_NAME = 'Otherwise';

export enum StepLocationKind {
  BRANCH = 'BRANCH',
  LOOP = 'LOOP',
  ON_SUCCESS = 'ON_SUCCESS',
  ON_FAILURE = 'ON_FAILURE',
}

export const stepLocationUtils = { locate, label };

export type StepLocationSegment =
  | {
      kind: StepLocationKind.BRANCH;
      stepDisplayName: string;
      branchName: string;
    }
  | {
      kind:
        | StepLocationKind.LOOP
        | StepLocationKind.ON_SUCCESS
        | StepLocationKind.ON_FAILURE;
      stepDisplayName: string;
    };

export type StepLocation = {
  ordinal: number;
  path: StepLocationSegment[];
};

type ChildScope = {
  first: Step | null | undefined;
  segment: StepLocationSegment;
};
