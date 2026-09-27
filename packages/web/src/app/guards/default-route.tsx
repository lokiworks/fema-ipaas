import { Navigate, useLocation } from 'react-router-dom';

import NotFoundPage from '@/app/routes/404-page';
import { useAuthorization } from '@/hooks/authorization-hooks';
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

export const UnknownRoute = () => {
  const token = authenticationSession.getToken();
  if (!token || authenticationSession.isOnboarding()) {
    return <DefaultRoute />;
  }
  return (
    <NotFoundPage
      title="Page not found"
      description="The link may be out of date, or the page was moved."
      buttonText="Go to home"
    />
  );
};

const AuthenticatedDefaultRoute = () => {
  const { checkAccess } = useAuthorization();
  return (
    <Navigate
      to={determineDefaultRoute({
        checkAccess,
      })}
      replace
    ></Navigate>
  );
};
