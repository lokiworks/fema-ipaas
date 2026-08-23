import { ApErrorParams, ErrorCode } from '@fema/core-utils';
import {
  BulkActionOnRunsRequestBody,
  BulkArchiveActionOnRunsRequestBody,
  BulkCancelFlowRequestBody,
  ExecutionCountByStatus,
  ExecutionStatus,
  FlowRetryStrategy,
  Execution,
  ExecutionWithRetryError,
  PopulatedFlow,
} from '@fema/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { getDefaultRange } from '@/components/custom/date-time-picker-range';
import { internalErrorToast } from '@/components/ui/sonner';
import { flowsApi } from '@/features/flows/api/flows-api';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

import { executionsApi } from '../api/executions-api';

export const executionKeys = {
  detail: (runId: string) => ['execution', runId] as const,
};

const STATUS_CATEGORIES = [
  {
    label: 'Succeeded',
    statuses: [ExecutionStatus.SUCCEEDED],
    color: 'hsl(var(--success))',
  },
  {
    label: 'Failed',
    statuses: [
      ExecutionStatus.FAILED,
      ExecutionStatus.INTERNAL_ERROR,
      ExecutionStatus.TIMEOUT,
      ExecutionStatus.MEMORY_LIMIT_EXCEEDED,
      ExecutionStatus.QUOTA_EXCEEDED,
      ExecutionStatus.LOG_SIZE_EXCEEDED,
    ],
    color: 'hsl(var(--destructive))',
  },
  {
    label: 'Running',
    statuses: [ExecutionStatus.RUNNING],
    color: 'hsl(var(--primary))',
  },
  {
    label: 'Queued',
    statuses: [ExecutionStatus.QUEUED],
    color: 'var(--muted-foreground)',
  },
  {
    label: 'Paused',
    statuses: [ExecutionStatus.PAUSED],
    color: 'hsl(var(--warning))',
  },
  {
    label: 'Canceled',
    statuses: [ExecutionStatus.CANCELED],
    color: 'var(--muted-foreground)',
  },
] as const;

function groupByCategory(data: ExecutionCountByStatus[]) {
  const statusToCount = new Map(data.map((d) => [d.status, d.count]));
  return STATUS_CATEGORIES.map((cat) => ({
    label: cat.label,
    color: cat.color,
    count: cat.statuses.reduce(
      (sum, s) => sum + (statusToCount.get(s) ?? 0),
      0,
    ),
  })).filter((cat) => cat.count > 0);
}

export const DEFAULT_DATE_PRESET = '7days' as const;

export const executionQueries = {
  useExecution: (runId: string) =>
    useQuery({
      queryKey: executionKeys.detail(runId),
      queryFn: () => executionsApi.getPopulated(runId),
      refetchInterval: 7000,
    }),
  useRunStats: () => {
    const workspaceId = authenticationSession.getWorkspaceId()!;

    const { data, isLoading, dataUpdatedAt, refetch } = useQuery({
      queryKey: ['execution-count-by-status', workspaceId],
      queryFn: () => {
        const range = getDefaultRange(DEFAULT_DATE_PRESET);
        return executionsApi.countByStatus({
          workspaceId,
          createdAfter: range.from.toISOString(),
          createdBefore: range.to.toISOString(),
        });
      },
      refetchInterval: 15000,
    });

    const categories = useMemo(() => groupByCategory(data?.data ?? []), [data]);
    const total = useMemo(
      () => categories.reduce((sum, c) => sum + c.count, 0),
      [categories],
    );

    return { categories, total, isLoading, dataUpdatedAt, refetch };
  },
};

export type RunStatusCategory = ReturnType<typeof groupByCategory>[number];

export const executionMutations = {
  useRetryRun: ({
    onSuccess,
  }: {
    onSuccess: (result: {
      run: Execution;
      populatedFlow: PopulatedFlow;
    }) => void;
  }) => {
    return useMutation<
      { run: Execution; populatedFlow: PopulatedFlow },
      Error,
      {
        runId: string;
        flowId: string;
        workspaceId: string;
        retryStrategy: FlowRetryStrategy;
      }
    >({
      mutationFn: async ({ runId, flowId, workspaceId, retryStrategy }) => {
        const updatedRun = await executionsApi.retry(runId, {
          workspaceId,
          strategy: retryStrategy,
        });
        const populatedFlow = await flowsApi.get(flowId, {
          versionId: updatedRun.flowVersionId,
        });
        return { run: updatedRun, populatedFlow };
      },
      onSuccess,
      onError: (error: unknown) => {
        if (api.isError(error)) {
          const apError = error.response?.data as ApErrorParams;
          if (apError.code === ErrorCode.EXECUTION_RETRY_OUTSIDE_RETENTION) {
            toast.error(t('Retry failed'), {
              description: t(
                'Retry is only available for {failedJobRetentionDays} after a run fails.',
                {
                  failedJobRetentionDays: apError.params.failedJobRetentionDays,
                },
              ),
              duration: 5000,
              closeButton: true,
              dismissible: true,
            });
          }
          return;
        }
        internalErrorToast();
      },
    });
  },
  useBulkRetryRuns: ({
    onSuccess,
    onPartialFailure,
  }: {
    onSuccess: (runs: Execution[]) => void;
    onPartialFailure?: (
      failedRuns: Required<ExecutionWithRetryError>[],
    ) => void;
  }) => {
    return useMutation({
      mutationFn: (request: BulkActionOnRunsRequestBody) =>
        executionsApi.bulkRetry(request),
      onSuccess: (runs) => {
        const succeededRuns = runs.filter((r) => !r.error) as Execution[];
        const failedRuns = runs.filter(
          (r) => !!r.error,
        ) as Required<ExecutionWithRetryError>[];
        onSuccess(succeededRuns);
        if (failedRuns.length > 0) {
          onPartialFailure?.(failedRuns);
        }
      },
    });
  },
  useBulkCancelRuns: ({ onSuccess }: { onSuccess: () => void }) => {
    return useMutation({
      mutationFn: (request: BulkCancelFlowRequestBody) =>
        executionsApi.bulkCancel(request),
      onSuccess,
    });
  },
  useBulkArchiveRuns: ({ onSuccess }: { onSuccess: () => void }) => {
    return useMutation({
      mutationFn: (request: BulkArchiveActionOnRunsRequestBody) =>
        executionsApi.bulkArchive(request),
      onSuccess,
    });
  },
};
