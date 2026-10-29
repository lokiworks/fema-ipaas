import { Permission } from '@fema-ipaas/core-utils';
import { DefaultProjectRole, TenantRole } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { userHooks } from '@/hooks/user-hooks';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

export const useProjectRole = ({
  projectId: scopedProjectId,
}: ProjectScope = {}) => {
  const projectId = scopedProjectId ?? authenticationSession.getProjectId();
  return useQuery({
    queryKey: ['project-member-role', projectId],
    queryFn: () =>
      api.get<MyProjectRole>('/v1/project-members/me', { projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useAuthorization = ({ projectId }: ProjectScope = {}) => {
  const { data, isLoading } = useProjectRole({ projectId });
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

type ProjectScope = {
  projectId?: string;
};
