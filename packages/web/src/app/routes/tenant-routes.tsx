import { TenantModule } from '@fema-ipaas/shared';
import React, { Suspense } from 'react';
import { Navigate } from 'react-router-dom';

import { PageTitle } from '@/app/components/page-title';
import { RouteLoadingBar } from '@/components/custom/route-loading-bar';
import { ModuleGate } from '@/features/tenant-access';

import { AllowOnlyLoggedInUserOnlyGuard } from '../components/allow-logged-in-user-only-guard';
import { TenantLayout } from '../components/tenant-layout';

const SettingsHealthPage = React.lazy(() => import('./tenant/infra/health'));
const TriggerHealthPage = React.lazy(() => import('./tenant/infra/triggers'));
const SettingsWorkersPage = React.lazy(() => import('./tenant/infra/workers'));
const SystemPage = React.lazy(() => import('./tenant/infra/system'));
const BackupPage = React.lazy(() => import('./tenant/infra/backup'));
const ProjectsPage = React.lazy(() => import('./tenant/projects'));
const AuthenticationPage = React.lazy(() =>
  import('./tenant/security/sso').then((m) => ({
    default: m.AuthenticationPage,
  })),
);
const EncryptionPage = React.lazy(() =>
  import('./tenant/security/encryption').then((m) => ({
    default: m.EncryptionPage,
  })),
);
const GeneralPage = React.lazy(() =>
  import('./tenant/setup/general').then((m) => ({
    default: m.GeneralPage,
  })),
);
const GlobalConnectionsTable = React.lazy(() =>
  import('./tenant/setup/connections').then((m) => ({
    default: m.GlobalConnectionsTable,
  })),
);
const TenantConnectorsPage = React.lazy(() =>
  import('./tenant/setup/connectors').then((m) => ({
    default: m.TenantConnectorsPage,
  })),
);
const TenantTemplatesPage = React.lazy(() =>
  import('./tenant/setup/templates').then((m) => ({
    default: m.TenantTemplatesPage,
  })),
);
const HolidayCalendarPage = React.lazy(() =>
  import('./tenant/setup/holidays').then((m) => ({
    default: m.HolidayCalendarPage,
  })),
);
const UsersPage = React.lazy(() => import('./tenant/users'));
const AccessRequestsPage = React.lazy(() => import('./tenant/access/requests'));
const AccessSettingsPage = React.lazy(() => import('./tenant/access/settings'));
const ResourcesPage = React.lazy(() => import('./tenant/resources'));
const AlertsPage = React.lazy(() => import('./tenant/alerts'));
const ProjectLimitsPage = React.lazy(() => import('./tenant/limits/projects'));
const UsageLimitsPage = React.lazy(() => import('./tenant/limits/usage'));
const PrivacyPage = React.lazy(() =>
  import('./tenant/security/privacy').then((m) => ({
    default: m.PrivacyPage,
  })),
);
const AuditLogPage = React.lazy(() => import('./tenant/audit'));
const ConnectorMarketplacePage = React.lazy(
  () => import('./tenant/connectors/marketplace'),
);
const ConnectorDetailPage = React.lazy(
  () => import('./tenant/connectors/detail'),
);
const McpServerDetailPage = React.lazy(
  () => import('./tenant/connectors/mcp-detail'),
);
const ConnectorRequestsPage = React.lazy(
  () => import('./tenant/connectors/requests'),
);
const ConnectorDevelopmentPage = React.lazy(
  () => import('./tenant/connectors/development'),
);
const ConnectorDevelopmentDetailPage = React.lazy(
  () => import('./tenant/connectors/development-detail'),
);
const ConnectorDevelopmentPublishPage = React.lazy(
  () => import('./tenant/connectors/development-publish'),
);
const OpenApiImportPage = React.lazy(
  () => import('./tenant/connectors/openapi-import'),
);
const TenantConnectionsPage = React.lazy(() => import('./tenant/connections'));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteLoadingBar />}>{children}</Suspense>;
}

function tenantRoute(path: string, title: string, Page: React.ComponentType) {
  return {
    path,
    element: (
      <TenantLayout>
        <PageTitle title={title}>
          <SuspenseWrapper>
            <Page />
          </SuspenseWrapper>
        </PageTitle>
      </TenantLayout>
    ),
  };
}

export const tenantRoutes = [
  {
    path: '/tenant',
    element: (
      <TenantLayout>
        <PageTitle title="Tenant">
          <Navigate to="/tenant/projects" />
        </PageTitle>
      </TenantLayout>
    ),
  },
  tenantRoute('/tenant/projects', 'Projects', ProjectsPage),
  tenantRoute('/tenant/users', 'Members', UsersPage),
  tenantRoute(
    '/tenant/access/requests',
    'Permission requests',
    AccessRequestsPage,
  ),
  tenantRoute(
    '/tenant/access/settings',
    'Permission settings',
    AccessSettingsPage,
  ),
  tenantRoute('/tenant/resources', 'Integration resources', ResourcesPage),
  tenantRoute('/tenant/audit', 'Audit Log', AuditLogPage),
  tenantRoute('/tenant/alerts', 'Alerts', AlertsPage),
  tenantRoute(
    '/tenant/limits/projects',
    'Projects and limits',
    ProjectLimitsPage,
  ),
  tenantRoute('/tenant/limits/usage', 'Usage and limits', UsageLimitsPage),
  tenantRoute('/tenant/connections', 'Connections', TenantConnectionsPage),
  {
    path: '/tenant/setup',
    element: (
      <TenantLayout>
        <PageTitle title="Tenant Setup">
          <Navigate to="/tenant/setup/general" replace />
        </PageTitle>
      </TenantLayout>
    ),
  },
  tenantRoute('/tenant/setup/general', 'General', GeneralPage),
  tenantRoute('/tenant/setup/connectors', 'Connectors', TenantConnectorsPage),
  tenantRoute(
    '/tenant/connectors',
    'Connector Marketplace',
    ConnectorMarketplacePage,
  ),
  tenantRoute(
    '/tenant/connectors/detail/:connectorName',
    'Connector',
    ConnectorDetailPage,
  ),
  tenantRoute(
    '/tenant/connectors/mcp/:serverId',
    'MCP Server',
    McpServerDetailPage,
  ),
  tenantRoute(
    '/tenant/connectors/requests',
    'Connector Requests',
    ConnectorRequestsPage,
  ),
  tenantRoute(
    '/tenant/connectors/development',
    'Connector Development',
    ConnectorDevelopmentPage,
  ),
  tenantRoute(
    '/tenant/connectors/development/:id',
    'Connector Development',
    ConnectorDevelopmentDetailPage,
  ),
  {
    path: '/tenant/connectors/development/:id/publish',
    element: (
      <AllowOnlyLoggedInUserOnlyGuard>
        <PageTitle title="Connector Development">
          <SuspenseWrapper>
            <ModuleGate module={TenantModule.CONNECTOR_DEVELOPMENT}>
              <ConnectorDevelopmentPublishPage />
            </ModuleGate>
          </SuspenseWrapper>
        </PageTitle>
      </AllowOnlyLoggedInUserOnlyGuard>
    ),
  },
  tenantRoute(
    '/tenant/connectors/development/:id/:section',
    'Connector Development',
    ConnectorDevelopmentDetailPage,
  ),
  tenantRoute(
    '/tenant/connectors/development/:id/:section/:sub',
    'Connector Development',
    ConnectorDevelopmentDetailPage,
  ),
  {
    path: '/tenant/connectors/builder',
    element: (
      <TenantLayout>
        <PageTitle title="Connector Development">
          <Navigate to="/tenant/connectors/development" replace />
        </PageTitle>
      </TenantLayout>
    ),
  },
  tenantRoute(
    '/tenant/connectors/openapi',
    'Import from OpenAPI',
    OpenApiImportPage,
  ),
  tenantRoute(
    '/tenant/setup/connections',
    'Global Connections',
    GlobalConnectionsTable,
  ),
  tenantRoute('/tenant/setup/templates', 'Templates', TenantTemplatesPage),
  tenantRoute(
    '/tenant/setup/holidays',
    'Holiday calendar',
    HolidayCalendarPage,
  ),
  {
    path: '/tenant/security',
    element: (
      <TenantLayout>
        <PageTitle title="Security">
          <Navigate to="/tenant/security/authentication" replace />
        </PageTitle>
      </TenantLayout>
    ),
  },
  tenantRoute(
    '/tenant/security/authentication',
    'Authentication',
    AuthenticationPage,
  ),
  tenantRoute('/tenant/security/encryption', 'Encryption', EncryptionPage),
  tenantRoute('/tenant/security/privacy', 'Data and privacy', PrivacyPage),
  {
    path: '/tenant/infra',
    element: (
      <TenantLayout>
        <PageTitle title="Infrastructure">
          <Navigate to="/tenant/infra/health" replace />
        </PageTitle>
      </TenantLayout>
    ),
  },
  tenantRoute('/tenant/infra/health', 'System Health', SettingsHealthPage),
  tenantRoute('/tenant/infra/triggers', 'Triggers', TriggerHealthPage),
  tenantRoute('/tenant/infra/workers', 'Workers', SettingsWorkersPage),
  tenantRoute('/tenant/infra/system', 'System and upgrades', SystemPage),
  tenantRoute('/tenant/infra/backup', 'Backup and restore', BackupPage),
];
