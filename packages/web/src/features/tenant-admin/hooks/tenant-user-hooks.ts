import { isNil, Permission, SeekPage } from '@fema/core-utils';
import {
  InvitationType,
  UpdateUserRequestBody,
  User,
  UserStatus,
  UserWithMetaInformation,
} from '@fema/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { tenantUserApi } from '@/api/tenant-user-api';
import { userInvitationApi } from '@/features/invitations';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { userHooks } from '@/hooks/user-hooks';

export const tenantUserKeys = {
  users: ['users'] as const,
  invitations: ['tenant-invitations'] as const,
};

export const tenantUserHooks = {
  useUsers: () => {
    const { data: currentUser } = userHooks.useCurrentUser();
    const { checkAccess, isFetchingWorkspaceRole } = useAuthorization();
    const hasInvitePermission = checkAccess(Permission.WRITE_INVITATION);
    const canListUsers =
      !isNil(currentUser) && hasInvitePermission && !isFetchingWorkspaceRole;
    return useQuery<SeekPage<UserWithMetaInformation>, Error>({
      queryKey: tenantUserKeys.users,
      queryFn: async () => {
        const results = await tenantUserApi.list({
          limit: 2000,
        });
        return results;
      },
      enabled: canListUsers,
    });
  },
  useTenantInvitations: () => {
    return useQuery({
      queryFn: () => {
        return userInvitationApi
          .list({
            type: InvitationType.TENANT,
            cursor: undefined,
            limit: 100,
            workspaceId: null,
          })
          .then((res) => res.data);
      },
      queryKey: tenantUserKeys.invitations,
      staleTime: 0,
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
    });
  },
};

export const tenantUserMutations = {
  useDeleteUser: ({ onSuccess }: { onSuccess: () => void }) => {
    return useMutation({
      mutationKey: ['delete-user'],
      mutationFn: async (userId: string) => {
        await tenantUserApi.delete(userId);
      },
      onSuccess: () => {
        onSuccess();
        toast.success(t('User deleted successfully'), { duration: 3000 });
      },
    });
  },
  useDeleteInvitation: ({ onSuccess }: { onSuccess: () => void }) => {
    return useMutation({
      mutationKey: ['delete-invitation'],
      mutationFn: async (invitationId: string) => {
        await userInvitationApi.delete(invitationId);
      },
      onSuccess: () => {
        onSuccess();
        toast.success(t('Invitation deleted successfully'), { duration: 3000 });
      },
    });
  },
  useUpdateUserStatus: ({
    onSuccess,
    onError,
  }: {
    onSuccess: () => void;
    onError?: (error: Error) => void;
  }) => {
    return useMutation({
      mutationFn: async (data: { userId: string; status: UserStatus }) => {
        await tenantUserApi.update(data.userId, { status: data.status });
        return data;
      },
      onSuccess: (data) => {
        onSuccess();
        toast.success(
          data.status === UserStatus.ACTIVE
            ? t('User activated successfully')
            : t('User deactivated successfully'),
          { duration: 3000 },
        );
      },
      onError,
    });
  },
  useUpdateUser: ({
    userId,
    onSuccess,
  }: {
    userId: string;
    onSuccess: (user: User) => void;
  }) => {
    return useMutation<User, Error, UpdateUserRequestBody>({
      mutationKey: ['update-user'],
      mutationFn: (request) => tenantUserApi.update(userId, request),
      onSuccess,
    });
  },
};
