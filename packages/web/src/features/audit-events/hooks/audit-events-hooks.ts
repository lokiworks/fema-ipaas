import { useQuery } from '@tanstack/react-query';

import { auditEventsApi } from '../api/audit-events-api';

export const auditEventsHooks = {
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

type UseAuditEventsParams = {
  cursor?: string;
  action?: string[];
  userId?: string;
  projectId?: string[];
  createdAfter?: string;
};
