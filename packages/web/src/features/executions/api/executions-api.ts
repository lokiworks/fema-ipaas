import { SeekPage } from '@fema-ipaas/core-utils';
import {
  CountExecutionsByStatusRequest,
  CountExecutionsByStatusResponse,
  Execution,
  ExecutionWithRetryError,
  ListExecutionsRequestQuery,
  RetryWorkflowRequestBody,
  TestExecutionRequestBody,
  WebsocketServerEvent,
  WebsocketClientEvent,
  CreateStepRunRequestBody,
  BulkActionOnRunsRequestBody,
  BulkArchiveActionOnRunsRequestBody,
  BulkCancelWorkflowRequestBody,
  UpdateRunProgressRequest,
} from '@fema-ipaas/shared';
import { Socket } from 'socket.io-client';

import { api } from '@/lib/api';

type TestStepParams = {
  request: CreateStepRunRequestBody;
};
export const executionsApi = {
  list(request: ListExecutionsRequestQuery): Promise<SeekPage<Execution>> {
    return api.get<SeekPage<Execution>>('/v1/executions', request);
  },
  countByStatus(
    request: CountExecutionsByStatusRequest,
  ): Promise<CountExecutionsByStatusResponse> {
    return api.get<CountExecutionsByStatusResponse>(
      '/v1/executions/count-by-status',
      request,
    );
  },
  getPopulated(id: string): Promise<Execution> {
    return api.get<Execution>(`/v1/executions/${id}`);
  },
  bulkRetry(
    request: BulkActionOnRunsRequestBody,
  ): Promise<ExecutionWithRetryError[]> {
    return api.post<ExecutionWithRetryError[]>('/v1/executions/retry', request);
  },
  bulkCancel(request: BulkCancelWorkflowRequestBody): Promise<Execution[]> {
    return api.post<Execution[]>('/v1/executions/cancel', request);
  },
  bulkArchive(request: BulkArchiveActionOnRunsRequestBody): Promise<void> {
    return api.post<void>('/v1/executions/archive', request);
  },
  retry(
    executionId: string,
    request: RetryWorkflowRequestBody,
  ): Promise<Execution> {
    return api.post<Execution>(`/v1/executions/${executionId}/retry`, request);
  },
  async subscribeToTestWorkflowOrManualRun(
    socket: Socket,
    request: TestExecutionRequestBody,
    onUpdate: (response: UpdateRunProgressRequest) => void,
    isForManualTrigger: boolean,
  ): Promise<void> {
    socket.emit(
      isForManualTrigger
        ? WebsocketServerEvent.MANUAL_TRIGGER_RUN_STARTED
        : WebsocketServerEvent.TEST_EXECUTION,
      request,
    );
    const initialRun = await getInitialRun(
      socket,
      request.workflowVersionId,
      isForManualTrigger,
    );
    onUpdate({
      execution: initialRun,
    });
    const handleUpdateRunProgress = (response: UpdateRunProgressRequest) => {
      if (response.execution.id === initialRun.id) {
        onUpdate(response);
        if (response.execution.finishTime) {
          socket.off(
            WebsocketClientEvent.UPDATE_RUN_PROGRESS,
            handleUpdateRunProgress,
          );
        }
      }
    };
    socket.on(
      WebsocketClientEvent.UPDATE_RUN_PROGRESS,
      handleUpdateRunProgress,
    );
  },
  async testStep(params: TestStepParams): Promise<{ runId: string }> {
    const { request } = params;
    const stepRun = await api.post<Execution>(
      '/v1/sample-data/test-step',
      request,
    );
    return { runId: stepRun.id };
  },
};
function getInitialRun(
  socket: Socket,
  workflowVersionId: string,
  forManualTrigger: boolean,
): Promise<Execution> {
  return new Promise<Execution>((resolve) => {
    const onRunStarted = (run: Execution) => {
      if (run.workflowVersionId !== workflowVersionId) {
        return;
      }
      if (forManualTrigger) {
        socket.off(
          WebsocketClientEvent.MANUAL_TRIGGER_RUN_STARTED,
          onRunStarted,
        );
      } else {
        socket.off(WebsocketClientEvent.TEST_EXECUTION_STARTED, onRunStarted);
      }
      resolve(run);
    };

    if (forManualTrigger) {
      socket.on(WebsocketClientEvent.MANUAL_TRIGGER_RUN_STARTED, onRunStarted);
    } else {
      socket.on(WebsocketClientEvent.TEST_EXECUTION_STARTED, onRunStarted);
    }
  });
}
