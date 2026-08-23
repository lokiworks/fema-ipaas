import { Navigate, useLocation } from 'react-router-dom';

import { useAuthorization } from '@/hooks/authorization-hooks';
import { tenantHooks } from '@/hooks/tenant-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { determineDefaultRoute } from '@/lib/route-utils';

export const DefaultRoute = () => {
  const token = authenticationSession.getToken();
  const location = useLocation();
  if (!token) {
    const searchParams = new URLSearchParams();
    searchParams.set('from', location.pathname + location.search);
    return (
      <Navigate
        to={`/sign-in?${searchParams.toString()}`}
        replace={true}
      ></Navigate>
    );
  }
  if (authenticationSession.isOnboarding()) {
    return <Navigate to="/create-tenant" replace />;
  }
  return <AuthenticatedDefaultRoute />;
};

const AuthenticatedDefaultRoute = () => {
  const { checkAccess } = useAuthorization();
  const { tenant } = tenantHooks.useCurrentTenant();
  return (
    <Navigate
      to={determineDefaultRoute({
        checkAccess,
        chatEnabled: tenant.plan.chatEnabled,
      })}
      replace
    ></Navigate>
  );
};
