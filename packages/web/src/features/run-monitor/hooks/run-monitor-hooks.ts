import {
  CreateRunMonitorViewRequestBody,
  UpdateRunMonitorViewRequestBody,
} from '@fema-ipaas/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { RunMonitorRequest, runMonitorApi } from '../api/run-monitor-api';

function useSummary(request: RunMonitorRequest) {
  return useQuery({
    queryKey: [RUN_MONITOR_QUERY_KEY, 'summary', request],
    queryFn: () => runMonitorApi.summary(request),
    placeholderData: keepPreviousData,
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useAiUsage(request: RunMonitorRequest) {
  return useQuery({
    queryKey: [RUN_MONITOR_QUERY_KEY, 'ai-usage', request],
    queryFn: () => runMonitorApi.aiUsage(request),
    placeholderData: keepPreviousData,
  });
}

function useOptions() {
  return useQuery({
    queryKey: [RUN_MONITOR_QUERY_KEY, 'options'],
    queryFn: () => runMonitorApi.options(),
  });
}

function useViews() {
  return useQuery({
    queryKey: [RUN_MONITOR_VIEWS_QUERY_KEY],
    queryFn: () => runMonitorApi.listViews(),
  });
}

function useCreateView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateRunMonitorViewRequestBody) =>
      runMonitorApi.createView(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [RUN_MONITOR_VIEWS_QUERY_KEY],
      });
    },
  });
}

function useUpdateView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string;
      request: UpdateRunMonitorViewRequestBody;
    }) => runMonitorApi.updateView({ id, request }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [RUN_MONITOR_VIEWS_QUERY_KEY],
      });
    },
  });
}

function useDeleteView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runMonitorApi.deleteView(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [RUN_MONITOR_VIEWS_QUERY_KEY],
      });
    },
  });
}

export const runMonitorHooks = {
  useSummary,
  useAiUsage,
  useOptions,
  useViews,
  useCreateView,
  useUpdateView,
  useDeleteView,
};

export const RUN_MONITOR_QUERY_KEY = 'run-monitor';
export const RUN_MONITOR_VIEWS_QUERY_KEY = 'run-monitor-views';
