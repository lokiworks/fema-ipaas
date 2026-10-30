import { isNil } from '@fema-ipaas/core-utils';
import {
  BatchUpdateIssuesRequestBody,
  IssueReplayRequestBody,
  WorkflowRetryStrategy,
  RunVerificationResult,
  IssueTrendGranularity,
  ListIssuesRequestQuery,
  UpdateIssueRequestBody,
  WorkflowStatus,
} from '@fema-ipaas/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { t } from 'i18next';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { internalErrorToast } from '@/components/ui/sonner';
import { workflowsApi } from '@/features/workflows';
import { api } from '@/lib/api';
import { notFoundError } from '@/lib/not-found-error';

import { issuesApi } from '../api/issues-api';

function useIssues(request: ListIssuesRequestQuery) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'list', request],
    queryFn: () => issuesApi.list(request),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useOverview({
  showErrorDialog,
  projectId,
}: {
  showErrorDialog: boolean;
  projectId?: string;
}) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'overview', projectId ?? null],
    queryFn: () => issuesApi.overview(projectId),
    placeholderData: keepPreviousData,
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

function useWorkflowAvailability({
  workflowId,
  workflowDisplayName,
}: {
  workflowId: string | null | undefined;
  workflowDisplayName: string | null | undefined;
}) {
  const knownDeleted = !isNil(workflowId) && isNil(workflowDisplayName);
  const { data, error } = useQuery({
    queryKey: [ISSUES_KEY, 'workflow-availability', workflowId],
    queryFn: () => workflowsApi.get(workflowId ?? ''),
    enabled: !isNil(workflowId) && !knownDeleted,
    retry: (failureCount, failure) =>
      !notFoundError.isNotFound(failure) && failureCount < 2,
    select: (workflow) => workflow.status,
  });
  return {
    stopped: data !== undefined && data !== WorkflowStatus.ENABLED,
    deleted: knownDeleted || notFoundError.isNotFound(error),
  };
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
    onSuccess: (_, request) => {
      void queryClient.invalidateQueries({ queryKey: [ISSUES_KEY] });
      if (request.status === undefined) {
        toast.success(t('Issue updated'), { position: 'bottom-right' });
      }
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

function useReplayCheck(
  id: string,
  enabled: boolean,
  strategy?: WorkflowRetryStrategy,
) {
  return useQuery({
    queryKey: [ISSUES_KEY, 'replay-check', id, strategy],
    queryFn: () => issuesApi.replayCheck(id, strategy),
    enabled,
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
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
      if (result.queued === 0) {
        toast.warning(t('No run was queued for rerun'), {
          description: t(
            'The runs changed since the check. Open the rerun dialog again to see why they are held back.',
          ),
        });
        return;
      }
      toast.success(
        t('{count} runs queued for rerun', { count: result.queued }),
        {
          description: t(
            'The issue is not closed automatically. Once the runs succeed, mark it as resolved.',
          ),
        },
      );
    },
    onError: () => internalErrorToast(),
  });
}

function verifyDescription(result: RunVerificationResult): string | undefined {
  const unreadable = result.problems.find(
    (problem) => problem.outcome === 'UNREADABLE',
  );
  if (unreadable) {
    return t('{key} could not be read: {reason}', {
      key: unreadable.businessKey,
      reason: unreadable.detail,
    });
  }
  return result.truncated
    ? t('Only the most recent runs were checked')
    : undefined;
}

function useVerify(projectId: string) {
  const queryClient = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: [ISSUES_KEY, 'verification', projectId, runId],
    queryFn: () => issuesApi.verificationRun({ projectId, runId: runId ?? '' }),
    enabled: runId !== null,
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
    refetchInterval: (current) =>
      ['SUCCEEDED', 'FAILED'].includes(current.state.data?.status ?? '') ||
      current.state.status === 'error'
        ? false
        : 3000,
  });
  useEffect(() => {
    if (query.error || query.data?.status === 'FAILED') {
      setRunId(null);
      if (query.data?.error) toast.error(t(query.data.error));
      return;
    }
    if (query.data?.status === 'SUCCEEDED' && query.data.result) {
      const result = query.data.result;
      setRunId(null);
      void queryClient.invalidateQueries({ queryKey: [ISSUES_KEY] });
      if (result.checked === 0) {
        toast.info(
          t('Nothing to check: no recent run wrote to a connected system'),
        );
        return;
      }
      toast.success(
        t(
          'Checked {checked}: {matched} match, {mismatched} differ, {unreadable} could not be read',
          {
            checked: result.checked,
            matched: result.matched,
            mismatched: result.mismatched,
            unreadable: result.unreadable,
          },
        ),
        { description: verifyDescription(result) },
      );
    }
  }, [query.data, query.error, queryClient]);
  const mutation = useMutation({
    mutationFn: () => issuesApi.verify({ projectId }),
    onSuccess: ({ runId: startedRunId }) => setRunId(startedRunId),
    onError: () => internalErrorToast(),
  });
  return { ...mutation, isPending: mutation.isPending || runId !== null };
}

const ISSUES_KEY = 'issues';

export const issuesHooks = {
  useVerify,
  useIssues,
  useOverview,
  useSummary,
  useIssue,
  useWorkflowAvailability,
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
