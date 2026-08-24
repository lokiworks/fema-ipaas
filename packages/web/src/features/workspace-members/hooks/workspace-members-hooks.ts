import { DefaultWorkspaceRole } from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { authenticationSession } from '@/lib/authentication-session';

import { workspaceMembersApi } from '../api/workspace-members-api';

const membersQueryKey = (workspaceId: string | null) => [
  'workspace-members',
  workspaceId,
];

function useMembers() {
  const workspaceId = authenticationSession.getWorkspaceId();
  return useQuery({
    queryKey: membersQueryKey(workspaceId),
    queryFn: () => workspaceMembersApi.list(workspaceId!),
    enabled: !!workspaceId,
  });
}

function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  const workspaceId = authenticationSession.getWorkspaceId();
  return useMutation({
    mutationFn: ({
      userId,
      role,
    }: {
      userId: string;
      role: DefaultWorkspaceRole;
    }) =>
      workspaceMembersApi.upsert({ workspaceId: workspaceId!, userId, role }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: membersQueryKey(workspaceId) }),
  });
}

function useRemoveMember() {
  const queryClient = useQueryClient();
  const workspaceId = authenticationSession.getWorkspaceId();
  return useMutation({
    mutationFn: (id: string) =>
      workspaceMembersApi.delete({ id, workspaceId: workspaceId! }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: membersQueryKey(workspaceId) }),
  });
}

export const workspaceMembersHooks = {
  useMembers,
  useUpdateMemberRole,
  useRemoveMember,
};
