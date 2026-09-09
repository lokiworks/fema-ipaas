import { DefaultProjectRole } from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { authenticationSession } from '@/lib/authentication-session';

import { projectMembersApi } from '../api/project-members-api';

const membersQueryKey = (projectId: string | null) => [
  'project-members',
  projectId,
];

function useMembers({ enabled = true }: UseMembersParams = {}) {
  const projectId = authenticationSession.getProjectId();
  return useQuery({
    queryKey: membersQueryKey(projectId),
    queryFn: () => projectMembersApi.list(projectId!),
    enabled: enabled && !!projectId,
  });
}

function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  const projectId = authenticationSession.getProjectId();
  return useMutation({
    mutationFn: ({
      userId,
      role,
    }: {
      userId: string;
      role: DefaultProjectRole;
    }) => projectMembersApi.upsert({ projectId: projectId!, userId, role }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: membersQueryKey(projectId) }),
  });
}

function useRemoveMember() {
  const queryClient = useQueryClient();
  const projectId = authenticationSession.getProjectId();
  return useMutation({
    mutationFn: (id: string) =>
      projectMembersApi.delete({ id, projectId: projectId! }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: membersQueryKey(projectId) }),
  });
}

export const projectMembersHooks = {
  useMembers,
  useUpdateMemberRole,
  useRemoveMember,
};

type UseMembersParams = {
  enabled?: boolean;
};
