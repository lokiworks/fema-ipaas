import { WorkflowRetryStrategy, WorkflowTrigger } from '@fema-ipaas/shared';

import {
  WriteStep,
  workflowValidator,
} from '@/features/workflows/utils/workflow-validator';

function stepOrderOf({ trigger }: { trigger: WorkflowTrigger }): string[] {
  return workflowValidator
    .collectSteps(trigger)
    .map((entry) => entry.step.name);
}

function splitWriteSteps({
  stepOrder,
  writeSteps,
  failedStepName,
  strategy,
}: {
  stepOrder: string[];
  writeSteps: WriteStep[];
  failedStepName: string | null;
  strategy: WorkflowRetryStrategy;
}): WriteStepSplit {
  if (strategy === WorkflowRetryStrategy.ON_LATEST_VERSION) {
    return { executed: writeSteps, kept: [] };
  }
  const failedIndex =
    failedStepName === null ? -1 : stepOrder.indexOf(failedStepName);
  if (failedIndex < 0) {
    return { executed: writeSteps, kept: [] };
  }
  return {
    executed: writeSteps.filter(
      (step) => stepOrder.indexOf(step.stepName) >= failedIndex,
    ),
    kept: writeSteps.filter(
      (step) => stepOrder.indexOf(step.stepName) < failedIndex,
    ),
  };
}

function groupRuns({ runs }: { runs: RerunRun[] }): RerunGroup[] {
  return runs.reduce<RerunGroup[]>((groups, run) => {
    const key = `${run.workflowVersionId}:${run.failedStepName ?? ''}`;
    const existing = groups.find((group) => group.key === key);
    if (!existing) {
      return [...groups, { ...run, key, count: 1 }];
    }
    return groups.map((group) =>
      group.key === key ? { ...group, count: group.count + 1 } : group,
    );
  }, []);
}

export const rerunPreviewUtils = {
  stepOrderOf,
  splitWriteSteps,
  groupRuns,
};

export type WriteStepSplit = {
  executed: WriteStep[];
  kept: WriteStep[];
};

export type RerunRun = {
  workflowId: string;
  workflowName: string | null;
  workflowVersionId: string;
  versionNumber: number | null;
  failedStepName: string | null;
};

export type RerunGroup = RerunRun & {
  key: string;
  count: number;
};
