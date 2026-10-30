import { isNil } from '@fema-ipaas/core-utils';
import {
  Execution,
  isExecutionStateTerminal,
  RunEnvironment,
  StepOutputStatus,
  WorkflowVersion,
  workflowStructureUtil,
} from '@fema-ipaas/shared';

import { stepTestRelevance } from './step-test-relevance';

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
    Object.entries(run.steps).flatMap(([stepName, output]) => {
      const status = finishedStatusOf(output);
      if (isNil(status)) {
        return [];
      }
      const tested = testedStepOf({
        stepName,
        testedAt,
        runVersion,
        currentVersion,
        failed: status === StepOutputStatus.FAILED,
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
  failed,
}: {
  stepName: string;
  testedAt: string;
  runVersion: WorkflowVersion;
  currentVersion: WorkflowVersion;
  failed: boolean;
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
  const signature = stepTestRelevance.signatureOf(ranStep);
  if (
    editedAfterRun ||
    signature !== stepTestRelevance.signatureOf(currentStep)
  ) {
    return null;
  }
  return { testedAt, signature, failed };
}

function finishedStatusOf(output: unknown): StepOutputStatus | null {
  if (typeof output !== 'object' || output === null || !('status' in output)) {
    return null;
  }
  if (output.status === StepOutputStatus.SUCCEEDED) {
    return StepOutputStatus.SUCCEEDED;
  }
  if (output.status === StepOutputStatus.FAILED) {
    return StepOutputStatus.FAILED;
  }
  return null;
}

export const debugTestedStepsUtils = {
  testedStepsOf,
  merge,
};

export type DebugTestedStep = {
  testedAt: string;
  signature: string;
  failed: boolean;
};
