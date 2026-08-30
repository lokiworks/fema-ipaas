import { Permission } from '@fema-ipaas/core-utils';
import { DefaultProjectRole, TenantRole } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { userHooks } from '@/hooks/user-hooks';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

export const useProjectRole = () => {
  const projectId = authenticationSession.getProjectId();
  return useQuery({
    queryKey: ['project-member-role', projectId],
    queryFn: () =>
      api.get<MyProjectRole>('/v1/project-members/me', { projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useAuthorization = () => {
  const { data, isLoading } = useProjectRole();
  const granted = useMemo(
    () => new Set(data?.permissions ?? []),
    [data?.permissions],
  );

  const checkAccess = (permission: Permission) =>
    !isLoading && granted.has(permission);

  return { checkAccess, isFetchingProjectRole: isLoading };
};

export const useIsTenantAdmin = () => {
  const tenantRole = userHooks.getCurrentUserTenantRole();
  return tenantRole === TenantRole.ADMIN;
};

export type MyProjectRole = {
  role: DefaultProjectRole | null;
  permissions: string[];
};
