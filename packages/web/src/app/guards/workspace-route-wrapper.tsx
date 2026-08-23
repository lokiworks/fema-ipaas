import { isNil } from '@fema-ipaas/core-utils';
import { t } from 'i18next';
import React from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { workspaceCollectionUtils } from '@/features/workspaces';
import {
  FROM_QUERY_PARAM,
  useDefaultRedirectPath,
} from '@/lib/navigation-utils';

import { authenticationSession } from '../../lib/authentication-session';
import { AllowOnlyLoggedInUserOnlyGuard } from '../components/allow-logged-in-user-only-guard';

export const TokenCheckerWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { workspaceId: workspaceIdFromParams } = useParams<{
    workspaceId: string;
  }>();

  if (isNil(workspaceIdFromParams)) {
    return <Navigate to="/sign-in" replace />;
  }
  const hasAccessToWorkspace = workspaceCollectionUtils.useHasAccessToWorkspace(
    workspaceIdFromParams,
  );

  if (!hasAccessToWorkspace) {
    toast.error(t('Invalid Access'), {
      description: t(
        'You tried to access a workspace that you do not have access to.',
      ),
      duration: 10000,
    });
    return <Navigate to="/" replace />;
  }

  authenticationSession.switchToWorkspace(workspaceIdFromParams);

  return <>{children}</>;
};

type RedirectToCurrentWorkspaceRouteProps = {
  path: string;
  children: React.ReactNode;
};
const RedirectToCurrentWorkspaceRoute: React.FC<
  RedirectToCurrentWorkspaceRouteProps
> = ({ path }) => {
  const currentWorkspaceId = authenticationSession.getWorkspaceId();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const defaultRedirectPath = useDefaultRedirectPath();
  const from = searchParams.get(FROM_QUERY_PARAM) ?? defaultRedirectPath;
  if (isNil(currentWorkspaceId)) {
    return (
      <Navigate
        to={`/sign-in?${new URLSearchParams({ from }).toString()}`}
        replace
      />
    );
  }

  const pathWithParams = `${path.startsWith('/') ? path : `/${path}`}`.replace(
    /:(\w+)/g,
    (_, param) => params[param] ?? '',
  );

  const searchParamsString = searchParams.toString();
  const pathWithParamsAndSearchParams = `${pathWithParams}${
    searchParamsString ? `?${searchParamsString}` : ''
  }`;
  return (
    <Navigate
      to={`/workspaces/${currentWorkspaceId}${pathWithParamsAndSearchParams}`}
      replace
    />
  );
};

interface WorkspaceRouterWrapperProps {
  path: string;
  element: React.ReactNode;
}

export const WorkspaceRouterWrapper = ({
  element,
  path,
}: WorkspaceRouterWrapperProps) => [
  {
    path: `/workspaces/:workspaceId${path.startsWith('/') ? path : `/${path}`}`,
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <TokenCheckerWrapper>{element}</TokenCheckerWrapper>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
  {
    path,
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <RedirectToCurrentWorkspaceRoute path={path}>
          {element}
        </RedirectToCurrentWorkspaceRoute>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
];
