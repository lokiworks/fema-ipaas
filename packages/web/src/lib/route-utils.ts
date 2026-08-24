import { Permission } from '@fema-ipaas/core-utils';

import { authenticationSession } from './authentication-session';

export const routesThatRequireWorkspaceId = {
  home: '/home',
  runs: '/runs',
  singleRun: '/runs/:runId',
  workflows: '/workflows',
  singleWorkflow: '/workflows/:workflowId',
  automations: '/automations',
  connections: '/connections',
  singleConnection: '/connections/:connectionId',
  variables: '/variables',
  settings: '/settings',
};

export const determineDefaultRoute = ({
  checkAccess,
}: {
  checkAccess: (permission: Permission) => boolean;
}) => {
  if (checkAccess(Permission.READ_RUN)) {
    return authenticationSession.appendWorkspaceRoutePrefix('/home');
  }
  if (checkAccess(Permission.READ_WORKFLOW)) {
    return authenticationSession.appendWorkspaceRoutePrefix('/automations');
  }
  return authenticationSession.appendWorkspaceRoutePrefix('/settings');
};

export const NEW_WORKFLOW_QUERY_PARAM = 'newWorkflow';
