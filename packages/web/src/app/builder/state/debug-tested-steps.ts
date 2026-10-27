import { isNil } from '@fema-ipaas/core-utils';
import {
  Execution,
  isExecutionStateTerminal,
  RunEnvironment,
  StepOutputStatus,
  WorkflowVersion,
  workflowStructureUtil,
} from '@fema-ipaas/shared';

import { versionDiff } from '@/features/releases/utils/version-diff';

function testedStepsOf({
  run,
  runVersion,
  currentVersion,
  observedAt,
}: {
  run: Execution;
  runVersion: WorkflowVersion;
  currentVersion: WorkflowVersion;
  observedAt: string;
}): Record<string, DebugTestedStep> {
  const isFinishedDebugRun =
    run.environment === RunEnvironment.TESTING &&
    isNil(run.stepNameToTest) &&
    !isNil(run.steps) &&
    isExecutionStateTerminal({
      status: run.status,
      ignoreInternalError: false,
    });
  if (!isFinishedDebugRun) {
    return {};
  }
  const testedAt = run.finishTime ?? observedAt;
  return Object.fromEntries(
    Object.entries(run.steps)
      .filter(([, output]) => outputSucceeded(output))
      .flatMap(([stepName]) => {
        const tested = testedStepOf({
          stepName,
          testedAt,
          runVersion,
          currentVersion,
        });
        return isNil(tested) ? [] : [[stepName, tested]];
      }),
  );
}

function merge({
  older,
  newer,
}: {
  older: Record<string, DebugTestedStep>;
  newer: Record<string, DebugTestedStep>;
}): Record<string, DebugTestedStep> {
  return { ...older, ...newer };
}

function testedStepOf({
  stepName,
  testedAt,
  runVersion,
  currentVersion,
}: {
  stepName: string;
  testedAt: string;
  runVersion: WorkflowVersion;
  currentVersion: WorkflowVersion;
}): DebugTestedStep | null {
  const ranStep = workflowStructureUtil.getStep(stepName, runVersion.trigger);
  const currentStep = workflowStructureUtil.getStep(
    stepName,
    currentVersion.trigger,
  );
  if (isNil(ranStep) || isNil(currentStep)) {
    return null;
  }
  const editedAfterRun =
    new Date(currentStep.lastUpdatedDate).getTime() >
    new Date(testedAt).getTime();
  const signature = versionDiff.stepSignature(ranStep);
  if (editedAfterRun || signature !== versionDiff.stepSignature(currentStep)) {
    return null;
  }
  return { testedAt, signature };
}

function outputSucceeded(output: unknown): boolean {
  return (
    typeof output === 'object' &&
    output !== null &&
    'status' in output &&
    output.status === StepOutputStatus.SUCCEEDED
  );
}

export const debugTestedStepsUtils = {
  testedStepsOf,
  merge,
};

export type DebugTestedStep = {
  testedAt: string;
  signature: string;
};
