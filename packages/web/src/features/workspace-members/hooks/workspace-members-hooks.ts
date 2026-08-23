import { useQuery } from '@tanstack/react-query';

import { authenticationSession } from '@/lib/authentication-session';

import { workspaceMembersApi } from '../api/workspace-members-api';

export const workspaceMembersHooks = {
  useMembers: () => {
    const workspaceId = authenticationSession.getWorkspaceId();
    return useQuery({
      queryKey: ['workspace-members', workspaceId],
      queryFn: () => workspaceMembersApi.list(workspaceId!),
      enabled: !!workspaceId,
    });
  },
};
