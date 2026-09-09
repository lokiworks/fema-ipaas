import {
  DefaultProjectRole,
  InvitationType,
  UserInvitation,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { authenticationSession } from '@/lib/authentication-session';

import { userInvitationApi } from '../api/user-invitation';

const userInvitationsQueryKey = 'user-invitations';

export const userInvitationsHooks = {
  useInvitations: () => {
    const projectId = authenticationSession.getProjectId();
    const query = useQuery<UserInvitation[]>({
      queryFn: () => {
        return userInvitationApi
          .list({
            type: InvitationType.PROJECT,
            projectId: projectId ?? undefined,
            cursor: undefined,
            limit: 100,
          })
          .then((res) => res.data);
      },
      queryKey: [userInvitationsQueryKey, projectId],
      staleTime: 0,
    });
    return {
      invitations: query.data,
      isLoading: query.isLoading,
      refetch: query.refetch,
    };
  },
};

export const userInvitationMutations = {
  useInviteToProject: ({ onSuccess }: { onSuccess: () => void }) => {
    const queryClient = useQueryClient();
    const projectId = authenticationSession.getProjectId();
    return useMutation({
      mutationFn: ({ email, projectRole }: InviteToProjectParams) =>
        userInvitationApi.invite({
          type: InvitationType.PROJECT,
          email,
          projectId: projectId!,
          projectRole,
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [userInvitationsQueryKey, projectId],
        });
        onSuccess();
      },
    });
  },
  useRevokeInvitation: ({ onSuccess }: { onSuccess: () => void }) => {
    const queryClient = useQueryClient();
    const projectId = authenticationSession.getProjectId();
    return useMutation({
      mutationFn: (id: string) => userInvitationApi.delete(id),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [userInvitationsQueryKey, projectId],
        });
        onSuccess();
      },
    });
  },
  useAcceptInvitation: ({
    onSuccess,
    onError,
  }: {
    onSuccess: (registered: boolean) => void;
    onError: (error: unknown) => void;
  }) => {
    return useMutation({
      mutationFn: async (token: string) => {
        const { registered } = await userInvitationApi.accept(token);
        return registered;
      },
      onSuccess,
      onError,
    });
  },
};

type InviteToProjectParams = {
  email: string;
  projectRole: DefaultProjectRole;
};
