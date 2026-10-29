import { isNil } from '@fema-ipaas/core-utils';
import {
  RouterExecutionType,
  StepOutputStatus,
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  workflowStructureUtil,
} from '@fema-ipaas/shared';

function runPathOf({
  trigger,
  finished,
  outputOf,
}: {
  trigger: WorkflowTrigger;
  finished: boolean;
  outputOf: (stepName: string) => RunStepOutput | undefined;
}): RunPath {
  const steps = workflowStructureUtil.getAllSteps(trigger);
  const executed = new Set(
    steps
      .filter((step) => !isNil(outputOf(step.name)))
      .map((step) => step.name),
  );
  const branches = steps
    .filter(isAction)
    .flatMap((step) =>
      branchDecisionsOf({ step, executed, finished, outputOf }),
    );
  const insideSkippedBranch = new Set(
    branches
      .filter((branch) => branch.state === 'skipped')
      .flatMap((branch) =>
        isNil(branch.head)
          ? []
          : workflowStructureUtil
              .getAllSteps(branch.head)
              .map((step) => step.name),
      ),
  );
  const notExecuted = new Set(
    steps
      .map((step) => step.name)
      .filter(
        (name) =>
          !executed.has(name) && (finished || insideSkippedBranch.has(name)),
      ),
  );
  return {
    executed,
    notExecuted,
    branchStates: Object.fromEntries(
      branches.map((branch) => [branch.key, branch.state]),
    ),
  };
}

function branchKey({
  stepName,
  branchIndex,
  failureBranch,
}: {
  stepName: string;
  branchIndex: number;
  failureBranch: boolean;
}): string {
  return failureBranch
    ? `${stepName}:cof:${branchIndex}`
    : `${stepName}:${branchIndex}`;
}

function branchOfEdgeId(edgeId: string): EdgeBranch | null {
  const match = EDGE_BRANCH_PATTERN.exec(edgeId);
  if (isNil(match)) {
    return null;
  }
  const [, bigButton, stepName, cof, index, end] = match;
  return {
    key: branchKey({
      stepName,
      branchIndex: Number(index),
      failureBranch: !isNil(cof),
    }),
    stepName,
    branchIndex: Number(index),
    isEnd: end === 'end',
    carriesTrunk: isNil(bigButton) && Number(index) === 0,
  };
}

function edgeStateOf({
  path,
  edgeId,
  source,
  nextStepName,
}: {
  path: RunPath | null;
  edgeId: string;
  source: string;
  nextStepName: string | null;
}): EdgeRunState {
  if (isNil(path)) {
    return 'neutral';
  }
  const branch = branchOfEdgeId(edgeId);
  if (!isNil(branch)) {
    const state = path.branchStates[branch.key];
    if (
      path.notExecuted.has(branch.stepName) ||
      (state === 'skipped' && !branch.carriesTrunk)
    ) {
      return 'off';
    }
    return state === 'taken' && !branch.isEnd ? 'on' : 'neutral';
  }
  if (path.notExecuted.has(source)) {
    return 'off';
  }
  if (
    path.executed.has(source) &&
    !isNil(nextStepName) &&
    path.executed.has(nextStepName)
  ) {
    return 'on';
  }
  return 'neutral';
}

function routerHitBranchNames({
  step,
  output,
}: {
  step: WorkflowAction;
  output: unknown;
}): string[] | null {
  if (step.type !== WorkflowActionType.ROUTER) {
    return null;
  }
  const taken = takenRouterIndexes({ step, output });
  if (isNil(taken)) {
    return null;
  }
  return taken.map(
    (index) => step.settings.branches[index]?.branchName ?? `${index + 1}`,
  );
}

function branchDecisionsOf({
  step,
  executed,
  finished,
  outputOf,
}: {
  step: WorkflowAction;
  executed: Set<string>;
  finished: boolean;
  outputOf: (stepName: string) => RunStepOutput | undefined;
}): BranchDecision[] {
  const stepOutput = outputOf(step.name);
  const ranInside = (head: WorkflowAction | null | undefined) =>
    !isNil(head) &&
    workflowStructureUtil
      .getAllSteps(head)
      .some((child) => executed.has(child.name));
  switch (step.type) {
    case WorkflowActionType.ROUTER:
    case WorkflowActionType.PARALLEL: {
      const isParallel = step.type === WorkflowActionType.PARALLEL;
      const taken = isNil(stepOutput)
        ? null
        : takenRouterIndexes({ step, output: stepOutput.output });
      const decided =
        isParallel ||
        !isNil(taken) ||
        stepOutput?.status !== StepOutputStatus.RUNNING;
      return step.children.map((head, index) => ({
        key: branchKey({
          stepName: step.name,
          branchIndex: index,
          failureBranch: false,
        }),
        head,
        state: decide({
          stepRan: !isNil(stepOutput),
          decided,
          taken:
            ranInside(head) ||
            (taken ?? []).includes(index) ||
            (isParallel && !isNil(stepOutput)),
        }),
      }));
    }
    case WorkflowActionType.CODE:
    case WorkflowActionType.CONNECTOR:
    case WorkflowActionType.COMPONENT: {
      if (isNil(step.continueOnFailureBranches)) {
        return [];
      }
      const heads = [
        step.continueOnFailureBranches.onSuccess,
        step.continueOnFailureBranches.onFailure,
      ];
      const failed = stepOutput?.status === StepOutputStatus.FAILED;
      const succeeded = stepOutput?.status === StepOutputStatus.SUCCEEDED;
      const anyBranchRan = heads.some(ranInside);
      return heads.map((head, index) => ({
        key: branchKey({
          stepName: step.name,
          branchIndex: index,
          failureBranch: true,
        }),
        head,
        state: decide({
          stepRan: !isNil(stepOutput),
          decided: anyBranchRan || finished,
          taken:
            ranInside(head) ||
            (!anyBranchRan &&
              isNil(head) &&
              (index === 0 ? succeeded : failed)),
        }),
      }));
    }
    default:
      return [];
  }
}

function decide({
  stepRan,
  decided,
  taken,
}: {
  stepRan: boolean;
  decided: boolean;
  taken: boolean;
}): BranchRunState {
  if (taken) {
    return 'taken';
  }
  return stepRan && decided ? 'skipped' : 'pending';
}

function takenRouterIndexes({
  step,
  output,
}: {
  step: WorkflowAction;
  output: unknown;
}): number[] | null {
  if (step.type !== WorkflowActionType.ROUTER || !isRecord(output)) {
    return null;
  }
  const evaluations = output['branches'];
  if (!Array.isArray(evaluations)) {
    return null;
  }
  const matched = evaluations.flatMap((evaluation, position) => {
    if (!isRecord(evaluation) || evaluation['evaluation'] !== true) {
      return [];
    }
    const branchIndex = evaluation['branchIndex'];
    return [typeof branchIndex === 'number' ? branchIndex - 1 : position];
  });
  return step.settings.executionType === RouterExecutionType.EXECUTE_FIRST_MATCH
    ? matched.slice(0, 1)
    : matched;
}

function isAction(
  step: WorkflowAction | WorkflowTrigger,
): step is WorkflowAction {
  return workflowStructureUtil.isAction(step.type);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && !isNil(value) && !Array.isArray(value);
}

export const runPathUtils = {
  runPathOf,
  edgeStateOf,
  branchOfEdgeId,
  branchKey,
  routerHitBranchNames,
};

const EDGE_BRANCH_PATTERN =
  /^(big-button-straight-line-for)?(.+?)-(cof-)?branch-(\d+)-(start|end)-edge$/;

type BranchDecision = {
  key: string;
  head: WorkflowAction | null | undefined;
  state: BranchRunState;
};

type EdgeBranch = {
  key: string;
  stepName: string;
  branchIndex: number;
  isEnd: boolean;
  carriesTrunk: boolean;
};

export type RunStepOutput = {
  status: StepOutputStatus;
  output: unknown;
};

export type BranchRunState = 'taken' | 'skipped' | 'pending';

export type EdgeRunState = 'on' | 'off' | 'neutral';

export type RunPath = {
  executed: Set<string>;
  notExecuted: Set<string>;
  branchStates: Record<string, BranchRunState>;
};
