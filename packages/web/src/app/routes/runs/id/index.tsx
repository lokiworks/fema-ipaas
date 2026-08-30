import { Execution, PopulatedWorkflow } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';
import { useParams } from 'react-router-dom';

import { BuilderPage } from '@/app/builder';
import { BuilderStateProvider } from '@/app/builder/state/builder-state-provider';
import { LoadingSpinner } from '@/components/custom/spinner';
import { executionsApi } from '@/features/executions';
import { workflowsApi, sampleDataHooks } from '@/features/workflows';

const ExecutionPage = () => {
  const { runId, projectId } = useParams();
  const { data, isLoading } = useQuery<
    {
      run: Execution;
      workflow: PopulatedWorkflow;
    },
    Error
  >({
    queryKey: ['run', runId],
    queryFn: async () => {
      const execution = await executionsApi.getPopulated(runId!);
      const workflow = await workflowsApi.get(execution.workflowId, {
        versionId: execution.workflowVersionId,
      });
      return {
        run: execution,
        workflow: workflow,
      };
    },
    enabled: runId !== undefined,
    refetchInterval: 15000,
  });

  const { data: sampleData, isLoading: isSampleDataLoading } =
    sampleDataHooks.useSampleDataForWorkflow(
      data?.workflow?.version,
      projectId,
    );

  const { data: sampleDataInput, isLoading: isSampleDataInputLoading } =
    sampleDataHooks.useSampleDataInputForWorkflow(
      data?.workflow?.version,
      projectId,
    );

  if (isLoading || isSampleDataLoading || isSampleDataInputLoading) {
    return (
      <div className="bg-background flex h-full w-full items-center justify-center ">
        <LoadingSpinner isLarge={true}></LoadingSpinner>
      </div>
    );
  }

  return (
    data && (
      <ReactFlowProvider>
        <BuilderStateProvider
          workflow={data.workflow}
          workflowVersion={data.workflow.version}
          readonly={true}
          hideTestWidget={false}
          run={data.run}
          outputSampleData={sampleData ?? {}}
          inputSampleData={sampleDataInput ?? {}}
        >
          <BuilderPage />
        </BuilderStateProvider>
      </ReactFlowProvider>
    )
  );
};

export { ExecutionPage };
