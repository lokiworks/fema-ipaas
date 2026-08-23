import { WorkspaceOverviewResponse } from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const overviewApi = {
  get(request: {
    workspaceId: string;
    days: number;
  }): Promise<WorkspaceOverviewResponse> {
    return api.get<WorkspaceOverviewResponse>(
      '/v1/executions/overview',
      request,
    );
  },
};
