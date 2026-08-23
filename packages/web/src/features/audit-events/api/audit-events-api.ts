import { ApplicationEvent, SeekPage } from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const auditEventsApi = {
  list(request: {
    cursor?: string;
    limit?: number;
    action?: string[];
  }): Promise<SeekPage<ApplicationEvent>> {
    return api.get<SeekPage<ApplicationEvent>>('/v1/audit-events', request);
  },
};
