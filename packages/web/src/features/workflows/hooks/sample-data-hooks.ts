import {
  workflowStructureUtil,
  WorkflowVersion,
  SampleDataFileType,
} from '@fema-ipaas/shared';
import { useQuery, QueryClient } from '@tanstack/react-query';

import { sampleDataApi } from '../api/sample-data-api';

export const sampleDataHooks = {
  useSampleDataForWorkflow: (
    workflowVersion: WorkflowVersion | undefined,
    projectId: string | undefined,
  ) => {
    return useQuery({
      queryKey: ['sampleData', workflowVersion?.id],
      enabled: !!workflowVersion,
      staleTime: 0,
      retry: 4,
      refetchOnWindowFocus: false,
      queryFn: async () => {
        const steps = workflowStructureUtil.getAllSteps(
          workflowVersion!.trigger,
        );
        const singleStepSampleData = await Promise.all(
          steps.map(async (step) => {
            return {
              [step.name]: await getSampleData(
                workflowVersion!,
                step.name,
                projectId!,
                SampleDataFileType.OUTPUT,
              ),
            };
          }),
        );
        const sampleData: Record<string, unknown> = {};
        singleStepSampleData.forEach((stepData) => {
          Object.assign(sampleData, stepData);
        });
        return sampleData;
      },
    });
  },
  useSampleDataInputForWorkflow: (
    workflowVersion: WorkflowVersion | undefined,
    projectId: string | undefined,
  ) => {
    return useQuery({
      queryKey: ['sampleDataInput', workflowVersion?.id],
      enabled: !!workflowVersion,
      staleTime: 0,
      retry: 4,
      refetchOnWindowFocus: false,
      queryFn: async () => {
        const steps = workflowStructureUtil.getAllSteps(
          workflowVersion!.trigger,
        );
        const singleStepSampleDataInput = await Promise.all(
          steps.map(async (step) => {
            return {
              [step.name]: step.settings.sampleData?.sampleDataInputFileId
                ? await getSampleData(
                    workflowVersion!,
                    step.name,
                    projectId!,
                    SampleDataFileType.INPUT,
                  )
                : undefined,
            };
          }),
        );
        const sampleDataInput: Record<string, unknown> = {};
        singleStepSampleDataInput.forEach((stepData) => {
          Object.assign(sampleDataInput, stepData);
        });
        return sampleDataInput;
      },
    });
  },
  invalidateSampleData: (
    workflowVersionId: string,
    queryClient: QueryClient,
  ) => {
    queryClient.invalidateQueries({
      queryKey: ['sampleData', workflowVersionId],
    });
    queryClient.invalidateQueries({
      queryKey: ['sampleDataInput', workflowVersionId],
    });
  },
};

async function getSampleData(
  workflowVersion: WorkflowVersion,
  stepName: string,
  projectId: string,
  type: SampleDataFileType,
): Promise<unknown> {
  return sampleDataApi
    .get({
      workflowId: workflowVersion.workflowId,
      workflowVersionId: workflowVersion.id,
      stepName,
      projectId,
      type,
    })
    .catch((error) => {
      console.error(error);
      return undefined;
    });
}
