import { Permission } from '@fema/core-utils';
import { PlatformRole } from '@fema/shared';

import { userHooks } from '@/hooks/user-hooks';

// Until the role model lands, reaching a workspace at all means holding every
// permission inside it — the server enforces workspace membership, not roles.
export const useAuthorization = () => {
  const checkAccess = (_permission: Permission) => true;

  return { checkAccess, isFetchingWorkspaceRole: false };
};

export const useIsPlatformAdmin = () => {
  const platformRole = userHooks.getCurrentUserPlatformRole();
  return platformRole === PlatformRole.ADMIN;
};
