import { useQueries, useQuery } from '@tanstack/react-query';

import { workflowsApi } from '@/features/workflows';

import { auditEventsApi } from '../api/audit-events-api';

function useWorkflowNames({
  projectIds,
}: {
  projectIds: string[];
}): Record<string, string> {
  return useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: ['audit-workflow-names', projectId],
      queryFn: async () => {
        const page = await workflowsApi.list({
          projectId,
          limit: WORKFLOW_NAME_LOOKUP_LIMIT,
          cursor: undefined,
        });
        return page.data.map((workflow) => ({
          id: workflow.id,
          displayName: workflow.version.displayName,
        }));
      },
      staleTime: 60_000,
    })),
    combine: (results) =>
      Object.fromEntries(
        results.flatMap((result) =>
          (result.data ?? []).map((workflow) => [
            workflow.id,
            workflow.displayName,
          ]),
        ),
      ),
  });
}

export const auditEventsHooks = {
  useWorkflowNames,
  useAuditEvents: ({
    cursor,
    action,
    userId,
    projectId,
    createdAfter,
  }: UseAuditEventsParams = {}) =>
    useQuery({
      queryKey: [
        'audit-events',
        cursor,
        action?.join(',') ?? 'all',
        userId ?? 'anyone',
        projectId?.join(',') ?? 'any-project',
        createdAfter ?? 'any-time',
      ],
      queryFn: () =>
        auditEventsApi.list({
          cursor,
          limit: 50,
          action,
          userId,
          projectId,
          createdAfter,
        }),
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
    }),
};

const WORKFLOW_NAME_LOOKUP_LIMIT = 200;

type UseAuditEventsParams = {
  cursor?: string;
  action?: string[];
  userId?: string;
  projectId?: string[];
  createdAfter?: string;
};
