import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowTrigger,
  workflowStructureUtil,
} from '@fema-ipaas/shared';

import { StepTestStatus } from '@/features/workflows/utils/workflow-validator';

import { DebugTestedStep } from './debug-tested-steps';
import { stepTestRelevance } from './step-test-relevance';

function statusOf({
  step,
  debugTested,
  failedInSession,
}: {
  step: WorkflowAction | WorkflowTrigger;
  debugTested: DebugTestedStep | undefined;
  failedInSession: boolean;
}): StepTestStatus {
  const lastTestDate = lastTestDateOf(step);
  const singleTestIsCurrent =
    !isNil(lastTestDate) &&
    timeOf(lastTestDate) >= timeOf(step.lastUpdatedDate);
  const debugIsCurrent =
    !isNil(debugTested) &&
    debugTested.signature === stepTestRelevance.signatureOf(step);
  const debugIsLatest =
    debugIsCurrent &&
    (!singleTestIsCurrent ||
      isNil(lastTestDate) ||
      timeOf(lastTestDate) <= timeOf(debugTested.testedAt));
  if (debugIsLatest) {
    return failedInSession || debugTested.failed
      ? StepTestStatus.FAILED
      : StepTestStatus.TESTED;
  }
  if (singleTestIsCurrent) {
    return failedInSession ? StepTestStatus.FAILED : StepTestStatus.TESTED;
  }
  if (!isNil(lastTestDate) || !isNil(debugTested)) {
    return StepTestStatus.CHANGED;
  }
  return StepTestStatus.UNTESTED;
}

function statusesOf({
  trigger,
  debugTestedSteps,
  errorLogs,
}: {
  trigger: WorkflowTrigger;
  debugTestedSteps: Record<string, DebugTestedStep>;
  errorLogs: Record<string, string | null>;
}): Record<string, StepTestStatus> {
  return Object.fromEntries(
    workflowStructureUtil.getAllSteps(trigger).map((step) => [
      step.name,
      statusOf({
        step,
        debugTested: debugTestedSteps[step.name],
        failedInSession: !isNil(errorLogs[step.name]),
      }),
    ]),
  );
}

function lastTestDateOf(step: WorkflowAction | WorkflowTrigger): string | null {
  const sampleData: unknown = step.settings.sampleData;
  if (
    typeof sampleData !== 'object' ||
    isNil(sampleData) ||
    !('lastTestDate' in sampleData) ||
    typeof sampleData.lastTestDate !== 'string'
  ) {
    return null;
  }
  return sampleData.lastTestDate;
}

function timeOf(value: string): number {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

export const stepTestState = {
  statusOf,
  statusesOf,
};
