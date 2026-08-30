import { ProjectOverviewResponse } from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const overviewApi = {
  get(request: {
    projectId: string;
    days: number;
  }): Promise<ProjectOverviewResponse> {
    return api.get<ProjectOverviewResponse>('/v1/executions/overview', request);
  },
};
