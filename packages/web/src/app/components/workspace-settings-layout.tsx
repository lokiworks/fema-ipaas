import { isNil } from '@fema-ipaas/core-utils';
import { Navigate } from 'react-router-dom';

import { authenticationSession } from '../../lib/authentication-session';

export default function WorkspaceSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentWorkspaceId = authenticationSession.getWorkspaceId();

  if (isNil(currentWorkspaceId)) {
    return <Navigate to="/sign-in" replace />;
  }

  return <div className="w-full">{children}</div>;
}
