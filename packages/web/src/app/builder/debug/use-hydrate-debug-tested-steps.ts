import { RunEnvironment, isExecutionStateTerminal } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { executionsApi } from '@/features/executions';
import { authenticationSession } from '@/lib/authentication-session';

export function useHydrateDebugTestedSteps() {
  const [workflowId, markDebugTested] = useBuilderStateContext((state) => [
    state.workflow.id,
    state.markDebugTested,
  ]);
  useQuery({
    queryKey: ['debug-tested-steps', workflowId],
    staleTime: Infinity,
    queryFn: async () => {
      const page = await executionsApi.list({
        workflowId: [workflowId],
        projectId: authenticationSession.getProjectId()!,
        limit: 1,
        environment: RunEnvironment.TESTING,
      });
      const latest = page.data.find((run) =>
        isExecutionStateTerminal({
          status: run.status,
          ignoreInternalError: false,
        }),
      );
      if (latest) {
        markDebugTested(await executionsApi.getPopulated(latest.id));
      }
      return null;
    },
  });
}
