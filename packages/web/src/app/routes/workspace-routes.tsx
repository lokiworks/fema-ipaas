import { Permission } from '@fema/core-utils';
import React, { Suspense } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { PageTitle } from '@/app/components/page-title';
import { RouteLoadingBar } from '@/components/custom/route-loading-bar';
import { lazyWithRetry } from '@/lib/lazy-with-retry';
import { routesThatRequireWorkspaceId } from '@/lib/route-utils';

import { BuilderLayout } from '../components/builder-layout';
import { WorkspaceDashboardLayout } from '../components/workspace-layout';
import { AfterImportWorkflowRedirect } from '../guards/after-import-workflow-redirect';
import { RoutePermissionGuard } from '../guards/permission-guard';
import { WorkspaceRouterWrapper } from '../guards/workspace-route-wrapper';

import { AutomationsPage } from './automations';
const WorkflowBuilderPage = lazyWithRetry(
  () =>
    import('./workflows/id').then((m) => ({ default: m.WorkflowBuilderPage })),
  'workflow-builder',
);
const RunsPage = lazyWithRetry(
  () => import('./runs').then((m) => ({ default: m.RunsPage })),
  'runs',
);
const ExecutionPage = lazyWithRetry(
  () => import('./runs/id').then((m) => ({ default: m.ExecutionPage })),
  'execution',
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
  Permission.READ_WORKFLOW,
  Permission.READ_FOLDER,
];

export const workspaceRoutes = [
  ...WorkspaceRouterWrapper({
    path: routesThatRequireWorkspaceId.automations,
    element: (
      <WorkspaceDashboardLayout>
        <RoutePermissionGuard requiredPermissions={automationsPagePermissions}>
          <PageTitle title="Workflows">
            <SuspenseWrapper>
              <AutomationsPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </WorkspaceDashboardLayout>
    ),
  }),
  ...WorkspaceRouterWrapper({
    path: routesThatRequireWorkspaceId.workflows,
    element: <Navigate to={routesThatRequireWorkspaceId.automations} replace />,
  }),
  ...WorkspaceRouterWrapper({
    path: routesThatRequireWorkspaceId.singleWorkflow,
    element: (
      <RoutePermissionGuard requiredPermissions={Permission.READ_WORKFLOW}>
        <PageTitle title="Builder">
          <BuilderLayout>
            <SuspenseWrapper>
              <WorkflowBuilderPage />
            </SuspenseWrapper>
          </BuilderLayout>
        </PageTitle>
      </RoutePermissionGuard>
    ),
  }),
  ...WorkspaceRouterWrapper({
    path: '/workflow-import-redirect/:workflowId',
    element: <AfterImportWorkflowRedirect></AfterImportWorkflowRedirect>,
  }),
  ...WorkspaceRouterWrapper({
    path: routesThatRequireWorkspaceId.singleRun,
    element: (
      <RoutePermissionGuard requiredPermissions={Permission.READ_RUN}>
        <PageTitle title="Workflow Run">
          <BuilderLayout>
            <SuspenseWrapper>
              <ExecutionPage />
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
