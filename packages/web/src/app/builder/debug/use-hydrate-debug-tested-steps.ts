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
      const latest = page.data.find(
        (run) =>
          isNil(run.stepNameToTest) &&
          isExecutionStateTerminal({
            status: run.status,
            ignoreInternalError: false,
          }),
      );
      if (latest) {
        const [run, runVersion] = await Promise.all([
          executionsApi.getPopulated(latest.id),
          workflowsApi.get(workflowId, { versionId: latest.workflowVersionId }),
        ]);
        markDebugTested({ run, workflowVersion: runVersion.version });
      }
      return null;
    },
  });
}

const LOOKBACK_RUNS = 10;
