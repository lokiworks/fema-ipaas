import {
  isExecutionStateTerminal,
  ListRunLogsRequestQuery,
  RerunRunLogsRequestBody,
  RerunRunLogsResponse,
  TerminateRunLogRequestBody,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { executionsApi } from '@/features/executions/api/executions-api';
import { api } from '@/lib/api';

import { runLogsApi } from '../api/run-logs-api';
import { followUpRefresh } from '../utils/follow-up-refresh';

function useRunLogs({ query }: { query: ListRunLogsRequestQuery }) {
  return useQuery({
    queryKey: [RUN_LOGS_KEY, query],
    queryFn: () => runLogsApi.list(query),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
    refetchInterval: (current) => {
      const running = (current.state.data?.data ?? []).some(
        (row) =>
          !isExecutionStateTerminal({
            status: row.status,
            ignoreInternalError: false,
          }),
      );
      return running ? REFRESH_INTERVAL_MS : false;
    },
  });
}

function useScope() {
  return useQuery({
    queryKey: [RUN_LOG_SCOPE_KEY],
    queryFn: () => runLogsApi.scope(),
    staleTime: 60 * 1000,
  });
}

function useDetail({ runId }: { runId: string | null }) {
  return useQuery({
    queryKey: [RUN_LOG_DETAIL_KEY, runId],
    queryFn: () => runLogsApi.detail(runId ?? ''),
    enabled: runId !== null,
    retry: false,
    refetchInterval: (current) => {
      const status = current.state.data?.row.status;
      if (status === undefined) {
        return false;
      }
      return isExecutionStateTerminal({ status, ignoreInternalError: false })
        ? false
        : REFRESH_INTERVAL_MS;
    },
  });
}

function useRunSteps({ runId, live }: { runId: string | null; live: boolean }) {
  return useQuery({
    queryKey: [RUN_LOG_STEPS_KEY, runId],
    queryFn: () => executionsApi.getPopulated(runId ?? ''),
    enabled: runId !== null,
    retry: false,
    refetchInterval: live ? REFRESH_INTERVAL_MS : false,
  });
}

function useRerun({
  onDone,
}: {
  onDone: (response: RerunRunLogsResponse) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RerunRunLogsRequestBody) => runLogsApi.rerun(request),
    onSuccess: (response) => {
      const queued = response.results.filter(
        (result) => result.rerunExecutionId !== null,
      ).length;
      const skipped = response.results.length - queued;
      if (queued > 0) {
        toast.success(t('runLogsRerunQueued', { count: queued }));
      }
      if (skipped > 0) {
        toast.warning(t('runLogsRerunSkipped', { count: skipped }));
      }
      const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: [RUN_LOGS_KEY] });
        void queryClient.invalidateQueries({ queryKey: [RUN_LOG_DETAIL_KEY] });
      };
      refresh();
      followUpRefresh.scheduleFollowUps({ refresh });
      onDone(response);
    },
    onError: (error) => {
      toast.error(
        api.extractServerErrorMessage(error, t('Failed to rerun the runs')),
      );
    },
  });
}

function useTerminate({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string;
      request: TerminateRunLogRequestBody;
    }) => runLogsApi.terminate({ id, request }),
    onSuccess: () => {
      toast.success(t('Run terminated'));
      const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: [RUN_LOGS_KEY] });
        void queryClient.invalidateQueries({ queryKey: [RUN_LOG_DETAIL_KEY] });
      };
      refresh();
      followUpRefresh.scheduleFollowUps({ refresh });
      onDone();
    },
    onError: (error) => {
      toast.error(
        api.extractServerErrorMessage(error, t('Failed to terminate the run')),
      );
    },
  });
}

const RUN_LOGS_KEY = 'run-logs';
const RUN_LOG_SCOPE_KEY = 'run-log-scope';
const RUN_LOG_DETAIL_KEY = 'run-log-detail';
const RUN_LOG_STEPS_KEY = 'run-log-steps';
const REFRESH_INTERVAL_MS = 15 * 1000;

export const runLogsHooks = {
  useRunLogs,
  useScope,
  useDetail,
  useRunSteps,
  useRerun,
  useTerminate,
};
