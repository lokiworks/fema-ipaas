import {
  Execution,
  isNil,
  PopulatedWorkflow,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';
import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { BuilderPage } from '@/app/builder';
import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { BuilderStateProvider } from '@/app/builder/state/builder-state-provider';
import { ResourceNotFound } from '@/components/custom/resource-not-found';
import { LoadingSpinner } from '@/components/custom/spinner';
import { executionsApi } from '@/features/executions';
import { RunPageBar } from '@/features/run-logs/components/run-page-bar';
import {
  RunFocus,
  runFocusUtils,
} from '@/features/run-logs/utils/run-focus-utils';
import { sampleDataHooks } from '@/features/workflows';
import { useIsMobile } from '@/hooks/use-mobile';
import { notFoundError } from '@/lib/not-found-error';

import { MobileRunView } from './mobile-run-view';

const ExecutionPage = () => {
  const { runId, projectId } = useParams();
  const [searchParams] = useSearchParams();
  const focus = runFocusUtils.parse(searchParams);
  const isMobile = useIsMobile();
  const { data, isLoading, error } = useQuery<
    {
      run: Execution;
      workflow: PopulatedWorkflow;
    },
    Error
  >({
    queryKey: ['run', runId],
    queryFn: async () => {
      const execution = await executionsApi.getPopulated(runId!);
      const workflow = await executionsApi.getRunWorkflow(execution);
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

  if (notFoundError.isNotFound(error)) {
    return <ResourceNotFound kind="run" />;
  }

  if (isLoading || isSampleDataLoading || isSampleDataInputLoading) {
    return (
      <div className="bg-background flex h-full w-full items-center justify-center ">
        <LoadingSpinner isLarge={true}></LoadingSpinner>
      </div>
    );
  }

  if (isMobile && !isNil(data)) {
    return <MobileRunView run={data.run} workflow={data.workflow} />;
  }

  const focusStepExists =
    !isNil(data) &&
    !isNil(focus.stepName) &&
    !isNil(
      workflowStructureUtil.getStep(
        focus.stepName,
        data.workflow.version.trigger,
      ),
    );

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
          {focusStepExists && <ApplyRunFocus focus={focus} />}
          {isNil(focus.issueId) ? (
            <BuilderPage />
          ) : (
            <div className="flex h-full w-full flex-col">
              <RunPageBar runId={data.run.id} issueId={focus.issueId} />
              <div className="min-h-0 flex-1">
                <BuilderPage />
              </div>
            </div>
          )}
        </BuilderStateProvider>
      </ReactFlowProvider>
    )
  );
};

function ApplyRunFocus({ focus }: { focus: RunFocus }) {
  const selectStepByName = useBuilderStateContext(
    (state) => state.selectStepByName,
  );
  const { stepName, panel } = focus;
  useEffect(() => {
    if (isNil(stepName) || isNil(panel)) {
      return;
    }
    selectStepByName(stepName, {
      fromAutoFocus: true,
      tab: runFocusUtils.stepPanelTab(panel),
    });
  }, [selectStepByName, stepName, panel]);
  return null;
}

export { ExecutionPage };
