import { useQuery } from '@tanstack/react-query';

import { auditEventsApi } from '../api/audit-events-api';

export const auditEventsHooks = {
  useAuditEvents: (cursor?: string) =>
    useQuery({
      queryKey: ['audit-events', cursor],
      queryFn: () => auditEventsApi.list({ cursor, limit: 50 }),
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
    }),
};
