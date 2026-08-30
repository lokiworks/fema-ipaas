import { Permission } from '@fema-ipaas/core-utils';
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { RouteLoadingBar } from '@/components/custom/route-loading-bar';
import { useAuthorization } from '@/hooks/authorization-hooks';

export const RoutePermissionGuard = ({
  requiredPermissions: permission,
  children,
}: {
  children: ReactNode;
  requiredPermissions: Permission | Permission[];
}) => {
  const { checkAccess, isFetchingProjectRole } = useAuthorization();
  if (isFetchingProjectRole) {
    return <RouteLoadingBar />;
  }
  const permissions = Array.isArray(permission) ? permission : [permission];
  const hasAccess = permissions.some((p) => checkAccess(p));
  if (!hasAccess) {
    return <Navigate replace={true} to="/404"></Navigate>;
  }
  return children;
};
