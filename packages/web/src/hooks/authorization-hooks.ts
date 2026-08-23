import { Permission } from '@fema/core-utils';
import { TenantRole } from '@fema/shared';

import { userHooks } from '@/hooks/user-hooks';

// Until the role model lands, reaching a workspace at all means holding every
// permission inside it — the server enforces workspace membership, not roles.
export const useAuthorization = () => {
  const checkAccess = (_permission: Permission) => true;

  return { checkAccess, isFetchingWorkspaceRole: false };
};

export const useIsTenantAdmin = () => {
  const tenantRole = userHooks.getCurrentUserTenantRole();
  return tenantRole === TenantRole.ADMIN;
};
