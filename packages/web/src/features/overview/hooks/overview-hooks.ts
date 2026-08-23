import { useQuery } from '@tanstack/react-query';

import { authenticationSession } from '@/lib/authentication-session';

import { overviewApi } from '../api/overview-api';

export const overviewHooks = {
  useWorkspaceOverview: (days: number) => {
    const workspaceId = authenticationSession.getWorkspaceId();
    return useQuery({
      queryKey: ['workspace-overview', workspaceId, days],
      queryFn: () => overviewApi.get({ workspaceId: workspaceId!, days }),
      enabled: !!workspaceId,
      staleTime: 60 * 1000,
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
    });
  },
};
