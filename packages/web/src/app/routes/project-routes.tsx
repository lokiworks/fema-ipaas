import { Permission } from '@fema-ipaas/core-utils';
import React, { Suspense } from 'react';
import { Navigate } from 'react-router-dom';

import { PageTitle } from '@/app/components/page-title';
import { RouteLoadingBar } from '@/components/custom/route-loading-bar';
import { lazyWithRetry } from '@/lib/lazy-with-retry';
import { routesThatRequireProjectId } from '@/lib/route-utils';

import { BuilderLayout } from '../components/builder-layout';
import { ProjectDashboardLayout } from '../components/project-layout';
import { AfterImportWorkflowRedirect } from '../guards/after-import-workflow-redirect';
import { RoutePermissionGuard } from '../guards/permission-guard';
import { ProjectRouterWrapper } from '../guards/project-route-wrapper';

import { AutomationsPage } from './automations';
const WorkflowBuilderPage = lazyWithRetry(
  () =>
    import('./workflows/id').then((m) => ({ default: m.WorkflowBuilderPage })),
  'workflow-builder',
);
const HomePage = lazyWithRetry(
  () => import('./home').then((m) => ({ default: m.HomePage })),
  'home',
);
const RunsPage = lazyWithRetry(
  () => import('./runs').then((m) => ({ default: m.RunsPage })),
  'runs',
);
const ExecutionPage = lazyWithRetry(
  () => import('./runs/id').then((m) => ({ default: m.ExecutionPage })),
  'execution',
);
const IssuesPage = lazyWithRetry(
  () => import('./issues').then((m) => ({ default: m.IssuesPage })),
  'issues',
);
const AgentApprovalsPage = lazyWithRetry(
  () =>
    import('./agent-approvals').then((m) => ({
      default: m.AgentApprovalsPage,
    })),
  'agent-approvals',
);
const IssueDetailPage = lazyWithRetry(
  () => import('./issues/id').then((m) => ({ default: m.IssueDetailPage })),
  'issue-detail',
);
const ReleasesPage = lazyWithRetry(
  () => import('./releases').then((m) => ({ default: m.ReleasesPage })),
  'releases',
);
const ReleaseDetailPage = lazyWithRetry(
  () => import('./releases/id').then((m) => ({ default: m.ReleaseDetailPage })),
  'release-detail',
);
const McpServicesPage = lazyWithRetry(
  () => import('./mcp-services').then((m) => ({ default: m.McpServicesPage })),
  'mcp-services',
);
const AiUsagePage = lazyWithRetry(
  () => import('./ai-usage').then((m) => ({ default: m.AiUsagePage })),
  'ai-usage',
);
const MappingTablesPage = lazyWithRetry(
  () =>
    import('./mapping-tables').then((m) => ({ default: m.MappingTablesPage })),
  'mapping-tables',
);
const ConnectionsPage = lazyWithRetry(
  () => import('./connections').then((m) => ({ default: m.ConnectionsPage })),
  'connections',
);
const VariablesPage = lazyWithRetry(
  () => import('./variables').then((m) => ({ default: m.VariablesPage })),
  'variables',
);

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteLoadingBar />}>{children}</Suspense>;
}

const automationsPagePermissions = [
  Permission.READ_WORKFLOW,
  Permission.READ_FOLDER,
];

export const projectRoutes = [
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.home,
    element: (
      <ProjectDashboardLayout>
        <RoutePermissionGuard requiredPermissions={Permission.READ_RUN}>
          <PageTitle title="Home">
            <SuspenseWrapper>
              <HomePage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </ProjectDashboardLayout>
    ),
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.automations,
    element: (
      <ProjectDashboardLayout>
        <RoutePermissionGuard requiredPermissions={automationsPagePermissions}>
          <PageTitle title="Workflows">
            <SuspenseWrapper>
              <AutomationsPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </ProjectDashboardLayout>
    ),
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.workflows,
    element: <Navigate to={routesThatRequireProjectId.automations} replace />,
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.singleWorkflow,
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
  ...ProjectRouterWrapper({
    path: '/workflow-import-redirect/:workflowId',
    element: <AfterImportWorkflowRedirect></AfterImportWorkflowRedirect>,
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.singleRun,
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
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.runs,
    element: (
      <ProjectDashboardLayout>
        <RoutePermissionGuard requiredPermissions={Permission.READ_RUN}>
          <PageTitle title="Runs">
            <SuspenseWrapper>
              <RunsPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </ProjectDashboardLayout>
    ),
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.issues,
    element: (
      <ProjectDashboardLayout>
        <RoutePermissionGuard requiredPermissions={Permission.READ_ISSUE}>
          <PageTitle title="Issues">
            <SuspenseWrapper>
              <IssuesPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </ProjectDashboardLayout>
    ),
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.agentApprovals,
    element: (
      <ProjectDashboardLayout>
        <RoutePermissionGuard requiredPermissions={Permission.READ_RUN}>
          <PageTitle title="Agent approvals">
            <SuspenseWrapper>
              <AgentApprovalsPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </ProjectDashboardLayout>
    ),
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.singleIssue,
    element: (
      <ProjectDashboardLayout>
        <RoutePermissionGuard requiredPermissions={Permission.READ_ISSUE}>
          <PageTitle title="Issue">
            <SuspenseWrapper>
              <IssueDetailPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </ProjectDashboardLayout>
    ),
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.releases,
    element: (
      <ProjectDashboardLayout>
        <RoutePermissionGuard
          requiredPermissions={Permission.READ_PROJECT_RELEASE}
        >
          <PageTitle title="Environments and releases">
            <SuspenseWrapper>
              <ReleasesPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </ProjectDashboardLayout>
    ),
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.singleRelease,
    element: (
      <ProjectDashboardLayout>
        <RoutePermissionGuard
          requiredPermissions={Permission.READ_PROJECT_RELEASE}
        >
          <PageTitle title="Release">
            <SuspenseWrapper>
              <ReleaseDetailPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </ProjectDashboardLayout>
    ),
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.mappingTables,
    element: (
      <ProjectDashboardLayout>
        <RoutePermissionGuard requiredPermissions={Permission.READ_WORKFLOW}>
          <PageTitle title="Mapping tables">
            <SuspenseWrapper>
              <MappingTablesPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </ProjectDashboardLayout>
    ),
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.mcpServices,
    element: (
      <ProjectDashboardLayout>
        <RoutePermissionGuard requiredPermissions={Permission.READ_MCP_SERVICE}>
          <PageTitle title="MCP services">
            <SuspenseWrapper>
              <McpServicesPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </ProjectDashboardLayout>
    ),
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.aiUsage,
    element: (
      <ProjectDashboardLayout>
        <RoutePermissionGuard requiredPermissions={Permission.READ_PROJECT}>
          <PageTitle title="AI usage">
            <SuspenseWrapper>
              <AiUsagePage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </ProjectDashboardLayout>
    ),
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.connections,
    element: (
      <ProjectDashboardLayout>
        <RoutePermissionGuard requiredPermissions={Permission.READ_CONNECTION}>
          <PageTitle title="Connections">
            <SuspenseWrapper>
              <ConnectionsPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </ProjectDashboardLayout>
    ),
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.variables,
    element: (
      <ProjectDashboardLayout>
        <RoutePermissionGuard requiredPermissions={Permission.READ_VARIABLE}>
          <PageTitle title="Variables">
            <SuspenseWrapper>
              <VariablesPage />
            </SuspenseWrapper>
          </PageTitle>
        </RoutePermissionGuard>
      </ProjectDashboardLayout>
    ),
  }),
  ...ProjectRouterWrapper({
    path: routesThatRequireProjectId.settings,
    element: <Navigate to={routesThatRequireProjectId.home} replace />,
  }),
];
