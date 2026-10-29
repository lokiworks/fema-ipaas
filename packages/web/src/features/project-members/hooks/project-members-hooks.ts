import { DefaultProjectRole } from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { authenticationSession } from '@/lib/authentication-session';

import { projectMembersApi } from '../api/project-members-api';

const membersQueryKey = (projectId: string | null) => [
  'project-members',
  projectId,
];

function useMembers({ enabled = true, projectId }: UseMembersParams = {}) {
  const resolvedProjectId = resolveProjectId(projectId);
  return useQuery({
    queryKey: membersQueryKey(resolvedProjectId),
    queryFn: () => projectMembersApi.list(resolvedProjectId!),
    enabled: enabled && !!resolvedProjectId,
  });
}

function useUpdateMemberRole({ projectId }: ProjectScope = {}) {
  const queryClient = useQueryClient();
  const resolvedProjectId = resolveProjectId(projectId);
  return useMutation({
    mutationFn: ({
      userId,
      role,
    }: {
      userId: string;
      role: DefaultProjectRole;
    }) =>
      projectMembersApi.upsert({
        projectId: resolvedProjectId!,
        userId,
        role,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: membersQueryKey(resolvedProjectId),
      }),
  });
}

function useRemoveMember({ projectId }: ProjectScope = {}) {
  const queryClient = useQueryClient();
  const resolvedProjectId = resolveProjectId(projectId);
  return useMutation({
    mutationFn: (id: string) =>
      projectMembersApi.delete({ id, projectId: resolvedProjectId! }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: membersQueryKey(resolvedProjectId),
      }),
  });
}

function useInvalidateMembers({ projectId }: ProjectScope = {}) {
  const queryClient = useQueryClient();
  const resolvedProjectId = resolveProjectId(projectId);
  return () =>
    queryClient.invalidateQueries({
      queryKey: membersQueryKey(resolvedProjectId),
    });
}

function resolveProjectId(projectId: string | undefined): string | null {
  return projectId ?? authenticationSession.getProjectId();
}

export const projectMembersHooks = {
  useInvalidateMembers,
  useMembers,
  useUpdateMemberRole,
  useRemoveMember,
};

type ProjectScope = {
  projectId?: string;
};

type UseMembersParams = ProjectScope & {
  enabled?: boolean;
};
