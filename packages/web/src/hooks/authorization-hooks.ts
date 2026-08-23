import { Permission } from '@fema-ipaas/core-utils';
import { DefaultWorkspaceRole, TenantRole } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { userHooks } from '@/hooks/user-hooks';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

export const useWorkspaceRole = () => {
  const workspaceId = authenticationSession.getWorkspaceId();
  return useQuery({
    queryKey: ['workspace-member-role', workspaceId],
    queryFn: () =>
      api.get<MyWorkspaceRole>('/v1/workspace-members/me', { workspaceId }),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useAuthorization = () => {
  const { data, isLoading } = useWorkspaceRole();
  const granted = useMemo(
    () => new Set(data?.permissions ?? []),
    [data?.permissions],
  );

  const checkAccess = (permission: Permission) =>
    !isLoading && granted.has(permission);

  return { checkAccess, isFetchingWorkspaceRole: isLoading };
};

export const useIsTenantAdmin = () => {
  const tenantRole = userHooks.getCurrentUserTenantRole();
  return tenantRole === TenantRole.ADMIN;
};

export type MyWorkspaceRole = {
  role: DefaultWorkspaceRole | null;
  permissions: string[];
};
