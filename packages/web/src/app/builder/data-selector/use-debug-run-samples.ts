import { isNil } from '@fema-ipaas/core-utils';
import {
  RunEnvironment,
  StepOutputStatus,
  WorkflowAction,
  WorkflowTrigger,
  isExecutionStateTerminal,
} from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { executionsApi } from '@/features/executions';
import { authenticationSession } from '@/lib/authentication-session';

import { useBuilderStateContext } from '../builder-hooks';

import { dataSelectorUtils } from './utils';

export function useDebugRunSamples({
  steps,
}: {
  steps: StepWithIndex[];
}): DebugRunSamples {
  const [workflowId, debugTestedSteps] = useBuilderStateContext((state) => [
    state.workflow.id,
    state.debugTestedSteps,
  ]);
  const candidates = useMemo(
    () =>
      steps.filter((step) => {
        const tested = debugTestedSteps[step.name];
        return (
          !isNil(tested) &&
          !tested.failed &&
          dataSelectorUtils.stepNeedsTesting(step)
        );
      }),
    [steps, debugTestedSteps],
  );
  const latestTestedAt = candidates.reduce((latest, step) => {
    const testedAt = debugTestedSteps[step.name]?.testedAt ?? '';
    return testedAt > latest ? testedAt : latest;
  }, '');
  const { data: outputs } = useQuery({
    queryKey: ['data-selector-debug-samples', workflowId, latestTestedAt],
    enabled: candidates.length > 0,
    staleTime: Infinity,
    queryFn: () => fetchLatestDebugOutputs({ workflowId }),
  });
  return useMemo(() => {
    const available = candidates.filter(
      (step) => !isNil(outputs) && step.name in outputs,
    );
    return {
      outputs: Object.fromEntries(
        available.map((step) => [step.name, outputs?.[step.name]]),
      ),
      testedAt: Object.fromEntries(
        available.map((step) => [
          step.name,
          debugTestedSteps[step.name]?.testedAt ?? '',
        ]),
      ),
    };
  }, [candidates, outputs, debugTestedSteps]);
}

async function fetchLatestDebugOutputs({
  workflowId,
}: {
  workflowId: string;
}): Promise<Record<string, unknown>> {
  const page = await executionsApi.list({
    workflowId: [workflowId],
    projectId: authenticationSession.getProjectId()!,
    limit: LOOKBACK_RUNS,
    environment: RunEnvironment.TESTING,
    excludeStepTests: true,
  });
  const latest = page.data.find(
    (run) =>
      isNil(run.stepNameToTest) &&
      isExecutionStateTerminal({
        status: run.status,
        ignoreInternalError: false,
      }),
  );
  if (isNil(latest)) {
    return {};
  }
  const run = await executionsApi.getPopulated(latest.id);
  return Object.fromEntries(
    Object.entries(run.steps ?? {}).flatMap(([stepName, stepOutput]) =>
      stepOutput.status === StepOutputStatus.SUCCEEDED
        ? [[stepName, stepOutput.output]]
        : [],
    ),
  );
}

const LOOKBACK_RUNS = 10;

type StepWithIndex = (WorkflowAction | WorkflowTrigger) & { dfsIndex: number };

export type DebugRunSamples = {
  outputs: Record<string, unknown>;
  testedAt: Record<string, string>;
};
