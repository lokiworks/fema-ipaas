import {
  UserInvitation,
  UserStatus,
  UserWithMetaInformation,
} from '@fema/shared';
import { t } from 'i18next';
import { User } from 'lucide-react';
import { useMemo } from 'react';

import { DashboardPageHeader } from '@/app/components/dashboard-page-header';
import LockedFeatureGuard from '@/app/components/locked-feature-guard';
import { DataTable } from '@/components/custom/data-table';
import { internalErrorToast } from '@/components/ui/sonner';
import {
  tenantUserHooks,
  tenantUserMutations,
} from '@/features/tenant-admin/hooks/tenant-user-hooks';

import { UserActions } from './actions/user-actions';
import { createUsersTableColumns } from './columns';

export type UserRowData =
  | {
      id: string;
      type: 'user';
      data: UserWithMetaInformation;
    }
  | {
      id: string;
      type: 'invitation';
      data: UserInvitation;
    };

export default function UsersPage() {
  const {
    data: usersData,
    isLoading: usersLoading,
    refetch: refetchUsers,
  } = tenantUserHooks.useUsers();

  const {
    data: invitationsData,
    isLoading: invitationsLoading,
    refetch: refetchInvitations,
  } = tenantUserHooks.useTenantInvitations();

  const refetch = () => {
    refetchUsers();
    refetchInvitations();
  };

  const combinedData: UserRowData[] = useMemo(() => {
    const users: UserRowData[] =
      usersData?.data?.map((user) => ({
        id: user.id,
        type: 'user' as const,
        data: user,
      })) ?? [];

    const pendingInvitations: UserRowData[] =
      invitationsData?.map((invitation) => ({
        id: invitation.id,
        type: 'invitation' as const,
        data: invitation,
      })) ?? [];

    return [...users, ...pendingInvitations];
  }, [usersData, invitationsData]);

  const isLoading = usersLoading || invitationsLoading;

  const { mutate: deleteUser } = tenantUserMutations.useDeleteUser({
    onSuccess: refetch,
  });

  const { mutate: deleteInvitation } = tenantUserMutations.useDeleteInvitation({
    onSuccess: refetch,
  });

  const { mutate: updateUserStatus, isPending: isUpdatingStatus } =
    tenantUserMutations.useUpdateUserStatus({
      onSuccess: refetch,
      onError: () => {
        internalErrorToast();
      },
    });

  const handleDelete = (id: string, isInvitation: boolean) => {
    if (isInvitation) {
      deleteInvitation(id);
    } else {
      deleteUser(id);
    }
  };

  const handleToggleStatus = (userId: string, currentStatus: UserStatus) => {
    updateUserStatus({
      userId,
      status:
        currentStatus === UserStatus.ACTIVE
          ? UserStatus.INACTIVE
          : UserStatus.ACTIVE,
    });
  };

  const columns = createUsersTableColumns();

  return (
    <LockedFeatureGuard
      featureKey="USERS"
      locked={false}
      lockTitle={t('Unlock Users')}
      lockDescription={t(
        'Manage your users and their access to your workspaces',
      )}
    >
      <div className="flex flex-col w-full">
        <DashboardPageHeader
          title={t('Users')}
          description={t(
            'Manage, delete, activate and deactivate users on tenant',
          )}
        />
        <DataTable
          emptyStateTextTitle={t('No users found')}
          emptyStateTextDescription={t(
            'Start inviting users to your workspace',
          )}
          emptyStateIcon={<User className="size-14" />}
          columns={columns}
          page={{
            data: combinedData,
            next: usersData?.next || null,
            previous: usersData?.previous || null,
          }}
          hidePagination={true}
          isLoading={isLoading}
          actions={[
            (row) => (
              <UserActions
                row={row}
                isUpdatingStatus={isUpdatingStatus}
                onDelete={handleDelete}
                onToggleStatus={handleToggleStatus}
                onUpdate={refetch}
              />
            ),
          ]}
        />
      </div>
    </LockedFeatureGuard>
  );
}
