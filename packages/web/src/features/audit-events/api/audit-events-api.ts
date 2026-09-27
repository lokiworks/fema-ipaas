import { ApplicationEvent, SeekPage } from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const auditEventsApi = {
  list(request: AuditEventsQuery): Promise<SeekPage<ApplicationEvent>> {
    return api.get<SeekPage<ApplicationEvent>>('/v1/audit-events', request);
  },
};

export type AuditEventsQuery = {
  cursor?: string;
  limit?: number;
  action?: string[];
  userId?: string;
  projectId?: string[];
  createdAfter?: string;
};
