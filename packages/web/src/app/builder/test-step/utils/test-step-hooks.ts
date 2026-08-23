import {
  ApErrorParams,
  ErrorCode,
  formatConnectorError,
  isString,
  tryParseFriendlyConnectorError,
} from '@fema/core-utils';
import {
  WorkflowAction,
  StepRunResponse,
  WorkflowTrigger,
  TriggerEventWithPayload,
  TriggerTestStrategy,
} from '@fema/shared';
import { useMutation } from '@tanstack/react-query';
import deepEqual from 'deep-equal';
import { t } from 'i18next';
import { useFormContext } from 'react-hook-form';

import { internalErrorToast } from '@/components/ui/sonner';
import { executionsApi } from '@/features/executions';
import { triggerEventsApi } from '@/features/workflows';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';
import { wait } from '@/lib/dom-utils';

import { useBuilderStateContext } from '../../builder-hooks';

import { testStepUtils } from './test-step-utils';

export const testStepHooks = {
  useSimulateTrigger: ({
    setErrorMessage,
    onSuccess,
  }: {
    setErrorMessage: ((msg: string | undefined) => void) | undefined;
    onSuccess: () => void;
  }) => {
    const { form, builderState } = useRequiredStateToTestSteps();
    const workflowId = builderState.workflow.id;
    const workflowVersionId = builderState.workflowVersionId;
    const stepName = form.getValues().name;

    return useMutation<TriggerEventWithPayload[], Error, AbortSignal>({
      mutationFn: async (abortSignal: AbortSignal) => {
        setErrorMessage?.(undefined);
        const ids = (
          await triggerEventsApi.list({
            workspaceId: authenticationSession.getWorkspaceId()!,
            workflowId,
            cursor: undefined,
            limit: 5,
          })
        ).data.map((triggerEvent) => triggerEvent.id);
        await triggerEventsApi.test({
          workspaceId: authenticationSession.getWorkspaceId()!,
          workflowId,
          workflowVersionId,
          testStrategy: TriggerTestStrategy.SIMULATION,
        });
        let attempt = 0;
        while (attempt < 1000) {
          if (abortSignal.aborted) {
            return [];
          }
          const newData = await triggerEventsApi.list({
            workspaceId: authenticationSession.getWorkspaceId()!,
            workflowId,
            cursor: undefined,
            limit: 5,
          });
          const newIds = newData.data.map((triggerEvent) => triggerEvent.id);
          if (!deepEqual(ids, newIds)) {
            if (newData.data.length > 0) {
              builderState.updateSampleData({
                stepName,
                output: newData.data[0].payload,
              });
            }
            return newData.data;
          }
          await wait(2000);
          attempt++;
        }
        return [];
      },
      onSuccess: async (results) => {
        if (results.length > 0) {
          onSuccess();
        }
      },
      onError: async (error) => {
        console.error(error);
        setErrorMessage?.(
          testStepUtils.formatErrorMessage(
            t('There is no sample data available found for this trigger.'),
          ),
        );
      },
    });
  },
  useSaveMockData: ({ onSuccess }: { onSuccess: () => void }) => {
    const { form, builderState } = useRequiredStateToTestSteps();
    const workflowId = builderState.workflow.id;
    const stepName = form.getValues().name;

    return useMutation({
      mutationFn: async (mockData: unknown) => {
        const data = await triggerEventsApi.saveTriggerMockdata({
          workspaceId: authenticationSession.getWorkspaceId()!,
          workflowId,
          mockData,
        });
        builderState.updateSampleData({
          stepName,
          output: data.payload,
        });
        return data;
      },
      onSuccess,
    });
  },
  usePollTrigger: ({
    setErrorMessage,
    onSuccess,
  }: {
    setErrorMessage: (msg: string | undefined) => void;
    onSuccess: () => void;
  }) => {
    const { form, builderState } = useRequiredStateToTestSteps();
    const workflowId = builderState.workflow.id;
    const workflowVersionId = builderState.workflowVersionId;
    const stepName = form.getValues().name;

    return useMutation<TriggerEventWithPayload[], Error, void>({
      mutationFn: async () => {
        setErrorMessage(undefined);
        const { data } = await triggerEventsApi.test({
          workspaceId: authenticationSession.getWorkspaceId()!,
          workflowId,
          workflowVersionId,
          testStrategy: TriggerTestStrategy.TEST_FUNCTION,
        });
        if (data.length > 0) {
          builderState.updateSampleData({
            stepName,
            output: data[0].payload,
          });
        }
        return data;
      },
      onSuccess: async (data) => {
        if (data.length > 0) {
          onSuccess();
        }
      },
      onError: (error) => {
        if (api.isError(error)) {
          const apError = error.response?.data as ApErrorParams;
          if (apError.code === ErrorCode.TEST_TRIGGER_FAILED) {
            const rawMessage = apError.params.message;
            const structured =
              tryParseFriendlyConnectorError(rawMessage) ??
              formatConnectorError(isString(rawMessage) ? rawMessage : apError);
            setErrorMessage(JSON.stringify(structured));
            return;
          }
          setErrorMessage(
            testStepUtils.formatErrorMessage(
              t('Failed to run test step, please ensure settings are correct.'),
            ),
          );
        } else {
          setErrorMessage(
            testStepUtils.formatErrorMessage(
              t('Internal error, please try again later.'),
            ),
          );
        }
      },
    });
  },
  /**To reset the loading state of the mutation use a new mutation key, but to make sure sucess never gets called, use the abortSignal */
  useTestAction: ({ currentStep }: { currentStep: WorkflowAction }) => {
    const { workflowVersionId, addActionTestListener } =
      useRequiredStateToTestSteps().builderState;
    return useMutation<{ runId: string }, Error, TestActionMutationParams>({
      mutationFn: async () => {
        const response = await executionsApi.testStep({
          request: {
            workspaceId: authenticationSession.getWorkspaceId()!,
            workflowVersionId,
            stepName: currentStep.name,
          },
        });
        return response;
      },
      onSuccess: (testStepResponse: { runId: string }) => {
        addActionTestListener({
          runId: testStepResponse.runId,
          stepName: currentStep.name,
        });
      },
      onError: () => {
        internalErrorToast();
      },
    });
  },
};

const useRequiredStateToTestSteps = () => {
  const form = useFormContext<WorkflowTrigger>();
  const builderState = useBuilderStateContext((state) => ({
    workflow: state.workflow,
    workflowVersion: state.workflowVersion,
    workflowVersionId: state.workflowVersion.id,
    addActionTestListener: state.addActionTestListener,
    updateSampleData: state.updateSampleData,
  }));
  return { form, builderState };
};

type TestActionMutationParams =
  | {
      preExistingSampleData: StepRunResponse;
      type: 'webhookAction';
      onProgress: undefined;
    }
  | {
      type: 'agentAction';
      onProgress: (progress: StepRunResponse) => void;
      onFinish?: () => void;
    }
  | undefined;
