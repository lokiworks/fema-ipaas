import { isNil } from '@fema-ipaas/core-utils';
import { RunEnvironment, isExecutionStateTerminal } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { executionsApi } from '@/features/executions';
import { workflowsApi } from '@/features/workflows';
import { authenticationSession } from '@/lib/authentication-session';

export function useHydrateDebugTestedSteps() {
  const [workflowId, markDebugTested] = useBuilderStateContext((state) => [
    state.workflow.id,
    state.markDebugTested,
  ]);
  useQuery({
    queryKey: ['debug-tested-steps', workflowId],
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const page = await executionsApi.list({
        workflowId: [workflowId],
        projectId: authenticationSession.getProjectId()!,
        limit: LOOKBACK_RUNS,
        environment: RunEnvironment.TESTING,
        excludeStepTests: true,
      });
      const finished = page.data
        .filter(
          (run) =>
            isNil(run.stepNameToTest) &&
            isExecutionStateTerminal({
              status: run.status,
              ignoreInternalError: false,
            }),
        )
        .slice(0, HYDRATED_RUNS)
        .reverse();
      const versionIds = [
        ...new Set(finished.map((run) => run.workflowVersionId)),
      ];
      const [runs, versions] = await Promise.all([
        Promise.all(finished.map((run) => executionsApi.getPopulated(run.id))),
        Promise.all(
          versionIds.map((versionId) =>
            workflowsApi.get(workflowId, { versionId }),
          ),
        ),
      ]);
      const versionById = new Map(
        versions.map((workflow) => [workflow.version.id, workflow.version]),
      );
      runs.forEach((run) => {
        const runVersion = versionById.get(run.workflowVersionId);
        if (!isNil(runVersion)) {
          markDebugTested({ run, workflowVersion: runVersion });
        }
      });
      return null;
    },
  });
}

const LOOKBACK_RUNS = 10;
const HYDRATED_RUNS = 5;
