import { Permission } from '@fema/core-utils';

import { authenticationSession } from './authentication-session';

export const routesThatRequireWorkspaceId = {
  runs: '/runs',
  singleRun: '/runs/:runId',
  flows: '/flows',
  singleFlow: '/flows/:flowId',
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
  if (checkAccess(Permission.READ_FLOW) || checkAccess(Permission.READ_TABLE)) {
    return authenticationSession.appendWorkspaceRoutePrefix('/automations');
  }
  if (checkAccess(Permission.READ_RUN)) {
    return authenticationSession.appendWorkspaceRoutePrefix('/runs');
  }
  return authenticationSession.appendWorkspaceRoutePrefix('/settings');
};

export const NEW_FLOW_QUERY_PARAM = 'newFlow';
export const NEW_TABLE_QUERY_PARAM = 'newTable';
