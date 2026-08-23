import { Permission } from '@fema/core-utils';
import React, { Suspense } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { PageTitle } from '@/app/components/page-title';
import { RouteLoadingBar } from '@/components/custom/route-loading-bar';
import { lazyWithRetry } from '@/lib/lazy-with-retry';
import { routesThatRequireWorkspaceId } from '@/lib/route-utils';

import { BuilderLayout } from '../components/builder-layout';
import { WorkspaceDashboardLayout } from '../components/workspace-layout';
import { AfterImportFlowRedirect } from '../guards/after-import-flow-redirect';
import { RoutePermissionGuard } from '../guards/permission-guard';
import { WorkspaceRouterWrapper } from '../guards/workspace-route-wrapper';

import { AutomationsPage } from './automations';
const FlowBuilderPage = lazyWithRetry(
  () => import('./flows/id').then((m) => ({ default: m.FlowBuilderPage })),
  'flow-builder',
);
const RunsPage = lazyWithRetry(
  () => import('./runs').then((m) => ({ default: m.RunsPage })),
  'runs',
);
const FlowRunPage = lazyWithRetry(
  () => import('./runs/id').then((m) => ({ default: m.FlowRunPage })),
  'flow-run',
);
const ConnectionsPage = lazyWithRetry(
  () => import('./connections').then((m) => ({ default: m.ConnectionsPage })),
  'connections',
);
const VariablesPage = lazyWithRetry(
  () => import('./variables').then((m) => ({ default: m.VariablesPage })),
  'variables',
);

const SettingsRerouter = () => {
  const { hash } = useLocation();
  const fragmentWithoutHash = hash.slice(1).toLowerCase();
  return fragmentWithoutHash ? (
    <Navigate to={`/settings/${fragmentWithoutHash}`} replace />
  ) : (
    <Navigate to="/settings/team" replace />
  );
};

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteLoadingBar />}>{children}</Suspense>;
}

const automationsPagePermissions = [
  Permission.READ_FLOW,
  Permission.READ_FOLDER,
];

export const workspaceRoutes = [
  ...WorkspaceRouterWrapper({
    path: routesThatRequireWorkspaceId.automations,
    element: (
      <WorkspaceDashboardLayout>
        <RoutePermissionGuard requiredPermissions={automationsPagePermissions}>
          <PageTitle title="Flows">
            <SuspenseWrapper>
              <AutomationsPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </WorkspaceDashboardLayout>
    ),
  }),
  ...WorkspaceRouterWrapper({
    path: routesThatRequireWorkspaceId.flows,
    element: <Navigate to={routesThatRequireWorkspaceId.automations} replace />,
  }),
  ...WorkspaceRouterWrapper({
    path: routesThatRequireWorkspaceId.singleFlow,
    element: (
      <RoutePermissionGuard requiredPermissions={Permission.READ_FLOW}>
        <PageTitle title="Builder">
          <BuilderLayout>
            <SuspenseWrapper>
              <FlowBuilderPage />
            </SuspenseWrapper>
          </BuilderLayout>
        </PageTitle>
      </RoutePermissionGuard>
    ),
  }),
  ...WorkspaceRouterWrapper({
    path: '/flow-import-redirect/:flowId',
    element: <AfterImportFlowRedirect></AfterImportFlowRedirect>,
  }),
  ...WorkspaceRouterWrapper({
    path: routesThatRequireWorkspaceId.singleRun,
    element: (
      <RoutePermissionGuard requiredPermissions={Permission.READ_RUN}>
        <PageTitle title="Flow Run">
          <BuilderLayout>
            <SuspenseWrapper>
              <FlowRunPage />
            </SuspenseWrapper>
          </BuilderLayout>
        </PageTitle>
      </RoutePermissionGuard>
    ),
  }),
  ...WorkspaceRouterWrapper({
    path: routesThatRequireWorkspaceId.runs,
    element: (
      <WorkspaceDashboardLayout>
        <RoutePermissionGuard requiredPermissions={Permission.READ_RUN}>
          <PageTitle title="Runs">
            <SuspenseWrapper>
              <RunsPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </WorkspaceDashboardLayout>
    ),
  }),
  ...WorkspaceRouterWrapper({
    path: routesThatRequireWorkspaceId.connections,
    element: (
      <WorkspaceDashboardLayout>
        <RoutePermissionGuard requiredPermissions={Permission.READ_CONNECTION}>
          <PageTitle title="Connections">
            <SuspenseWrapper>
              <ConnectionsPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </WorkspaceDashboardLayout>
    ),
  }),
  ...WorkspaceRouterWrapper({
    path: routesThatRequireWorkspaceId.variables,
    element: (
      <WorkspaceDashboardLayout>
        <RoutePermissionGuard requiredPermissions={Permission.READ_VARIABLE}>
          <PageTitle title="Variables">
            <SuspenseWrapper>
              <VariablesPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </WorkspaceDashboardLayout>
    ),
  }),
  ...WorkspaceRouterWrapper({
    path: routesThatRequireWorkspaceId.settings,
    element: (
      <WorkspaceDashboardLayout>
        <SettingsRerouter></SettingsRerouter>
      </WorkspaceDashboardLayout>
    ),
  }),
];
