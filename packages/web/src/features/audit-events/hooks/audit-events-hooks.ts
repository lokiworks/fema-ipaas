import { useQuery } from '@tanstack/react-query';

import { auditEventsApi } from '../api/audit-events-api';

export const auditEventsHooks = {
  useAuditEvents: ({ cursor, action }: UseAuditEventsParams = {}) =>
    useQuery({
      queryKey: ['audit-events', cursor, action?.join(',') ?? 'all'],
      queryFn: () => auditEventsApi.list({ cursor, limit: 50, action }),
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
    }),
};

type UseAuditEventsParams = {
  cursor?: string;
  action?: string[];
};
