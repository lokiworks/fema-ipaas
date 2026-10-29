import { Navigate, useLocation } from 'react-router-dom';

import { SocketProvider } from '@/components/providers/socket-provider';
import { useTelemetry } from '@/components/providers/telemetry-provider';
import { projectCollectionUtils } from '@/features/projects';
import { flagsHooks } from '@/hooks/flags-hooks';
import { tenantHooks } from '@/hooks/tenant-hooks';
import { loginRedirect } from '@/lib/login-redirect';

import { authenticationSession } from '../../lib/authentication-session';

type AllowOnlyLoggedInUserOnlyGuardProps = {
  children: React.ReactNode;
};
export const AllowOnlyLoggedInUserOnlyGuard = ({
  children,
}: AllowOnlyLoggedInUserOnlyGuardProps) => {
  const { reset } = useTelemetry();
  const location = useLocation();
  if (!authenticationSession.isLoggedIn()) {
    authenticationSession.clearSession();
    reset();
    return (
      <Navigate
        to={loginRedirect.signInPath(location.pathname + location.search)}
        replace
      />
    );
  }
  if (authenticationSession.isOnboarding()) {
    return <Navigate to="/create-tenant" replace />;
  }
  tenantHooks.useCurrentTenant();
  flagsHooks.useFlags();
  projectCollectionUtils.useCurrentProject();
  return <SocketProvider>{children}</SocketProvider>;
};
