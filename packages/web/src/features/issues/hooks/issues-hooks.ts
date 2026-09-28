import {
  BatchUpdateIssuesRequestBody,
  IssueReplayRequestBody,
  IssueTrendGranularity,
  ListIssuesRequestQuery,
  UpdateIssueRequestBody,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { internalErrorToast } from '@/components/ui/sonner';
import { api } from '@/lib/api';

import { issuesApi } from '../api/issues-api';

function useIssues(request: ListIssuesRequestQuery) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'list', request],
    queryFn: () => issuesApi.list(request),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useOverview({ showErrorDialog }: { showErrorDialog: boolean }) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'overview'],
    queryFn: () => issuesApi.overview(),
    meta: { showErrorDialog, loadSubsetOptions: {} },
  });
}

function useSummary(projectId: string) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'summary', projectId],
    queryFn: () => issuesApi.summary(projectId),
  });
}

function useIssue(id: string) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'one', id],
    queryFn: () => issuesApi.get(id),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useActivities(id: string) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'activities', id],
    queryFn: () => issuesApi.activities(id),
  });
}

function useExecutions({
  id,
  cursor,
  limit,
}: {
  id: string;
  cursor?: string;
  limit: number;
}) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'executions', id, cursor, limit],
    queryFn: () => issuesApi.executions(id, { cursor, limit }),
  });
}

function useTrend({
  id,
  granularity,
}: {
  id: string;
  granularity: IssueTrendGranularity;
}) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'trend', id, granularity],
    queryFn: () => issuesApi.trend(id, granularity),
  });
}

function useInsight(id: string) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'insight', id],
    queryFn: () => issuesApi.insight(id),
  });
}

function useAlerts(id: string) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'alerts', id],
    queryFn: () => issuesApi.alerts(id),
  });
}

function useAffectedWorkflows(id: string) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'workflows', id],
    queryFn: () => issuesApi.workflows(id),
  });
}

function useUpdateIssue(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateIssueRequestBody) =>
      issuesApi.update(id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ISSUES_KEY] });
      toast.success(t('Issue updated'));
    },
    onError: (error) => {
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      );
    },
  });
}

function useBatchUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: BatchUpdateIssuesRequestBody) =>
      issuesApi.batchUpdate(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ISSUES_KEY] });
      toast.success(t('Issues updated'));
    },
    onError: () => internalErrorToast(),
  });
}

function useAddNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => issuesApi.addNote(id, text),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [ISSUES_KEY, 'activities', id],
      });
    },
    onError: () => internalErrorToast(),
  });
}

function useReplayCheck(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'replay-check', id],
    queryFn: () => issuesApi.replayCheck(id),
    enabled,
    staleTime: 0,
  });
}

function useReplay(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: IssueReplayRequestBody) =>
      issuesApi.replay(id, request),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: [ISSUES_KEY] });
      toast.success(
        t('{count} runs queued for replay', { count: result.queued }),
      );
    },
    onError: () => internalErrorToast(),
  });
}

const ISSUES_KEY = 'issues';

export const issuesHooks = {
  useIssues,
  useOverview,
  useSummary,
  useIssue,
  useActivities,
  useExecutions,
  useTrend,
  useInsight,
  useAlerts,
  useAffectedWorkflows,
  useUpdateIssue,
  useBatchUpdate,
  useAddNote,
  useReplayCheck,
  useReplay,
};
