import { isNil } from '@fema-ipaas/core-utils';
import { Execution, UpdateRunProgressRequest } from '@fema-ipaas/shared';

import { executionUtils } from '@/features/executions';

function mergeProgress({
  response,
  currentRun,
  lastRun,
}: {
  response: UpdateRunProgressRequest;
  currentRun: Execution | null;
  lastRun: Execution | null;
}): Execution {
  const { execution } = response;
  const known = [currentRun, lastRun].find(
    (candidate): candidate is Execution =>
      !isNil(candidate) && candidate.id === execution.id,
  );
  const previousSteps = known?.steps ?? currentRun?.steps ?? {};
  const startTime = execution.startTime ?? known?.startTime;
  const steps = isNil(response.step)
    ? previousSteps
    : executionUtils.updateRunSteps(
        previousSteps,
        response.step.name,
        response.step.path,
        response.step.output,
      );
  return { ...execution, startTime, steps };
}

function isAfterReturnToEditing({
  returnedRunId,
  runId,
}: {
  returnedRunId: string | null;
  runId: string;
}): boolean {
  return !isNil(returnedRunId) && returnedRunId === runId;
}

export const debugRunProgressUtils = {
  mergeProgress,
  isAfterReturnToEditing,
};
