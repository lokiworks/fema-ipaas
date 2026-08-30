import { useQuery } from '@tanstack/react-query';

import { authenticationSession } from '@/lib/authentication-session';

import { overviewApi } from '../api/overview-api';

export const overviewHooks = {
  useProjectOverview: (days: number) => {
    const projectId = authenticationSession.getProjectId();
    return useQuery({
      queryKey: ['project-overview', projectId, days],
      queryFn: () => overviewApi.get({ projectId: projectId!, days }),
      enabled: !!projectId,
      staleTime: 60 * 1000,
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
    });
  },
};
