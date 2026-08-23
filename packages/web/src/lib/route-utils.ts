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
  singleAgent: '/agents/:agentId',
  tables: '/tables',
  singleTable: '/tables/:tableId',
  settings: '/settings',
  releases: '/releases',
  singleRelease: '/releases/:releaseId',
};

export const CHAT_ROUTE = '/chat';

export const determineDefaultRoute = ({
  checkAccess,
  chatEnabled,
}: {
  checkAccess: (permission: Permission) => boolean;
  chatEnabled?: boolean;
}) => {
  if (chatEnabled) {
    return CHAT_ROUTE;
  }
  if (checkAccess(Permission.READ_RUN)) {
    return authenticationSession.appendWorkspaceRoutePrefix('/home');
  }
  if (checkAccess(Permission.READ_WORKFLOW)) {
    return authenticationSession.appendWorkspaceRoutePrefix('/automations');
  }
  return authenticationSession.appendWorkspaceRoutePrefix('/settings');
};

export const NEW_WORKFLOW_QUERY_PARAM = 'newWorkflow';
export const NEW_TABLE_QUERY_PARAM = 'newTable';
