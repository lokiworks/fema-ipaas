import React, { Suspense } from 'react';
import { Navigate } from 'react-router-dom';

import { PageTitle } from '@/app/components/page-title';
import { RouteLoadingBar } from '@/components/custom/route-loading-bar';

import { TenantLayout } from '../components/tenant-layout';

const SettingsHealthPage = React.lazy(() => import('./tenant/infra/health'));
const TriggerHealthPage = React.lazy(() => import('./tenant/infra/triggers'));
const SettingsWorkersPage = React.lazy(() => import('./tenant/infra/workers'));
const WorkspacesPage = React.lazy(() => import('./tenant/workspaces'));
const SSOPage = React.lazy(() =>
  import('./tenant/security/sso').then((m) => ({ default: m.SSOPage })),
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
const UsersPage = React.lazy(() => import('./tenant/users'));
const AuditLogPage = React.lazy(() => import('./tenant/audit'));
const ConnectorMarketplacePage = React.lazy(
  () => import('./tenant/connectors/marketplace'),
);
const ConnectorDevelopmentPage = React.lazy(
  () => import('./tenant/connectors/development'),
);
const ConnectorBuilderPage = React.lazy(
  () => import('./tenant/connectors/builder'),
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
          <Navigate to="/tenant/workspaces" />
        </PageTitle>
      </TenantLayout>
    ),
  },
  tenantRoute('/tenant/workspaces', 'Workspaces', WorkspacesPage),
  tenantRoute('/tenant/users', 'Members', UsersPage),
  tenantRoute('/tenant/audit', 'Audit Log', AuditLogPage),
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
    '/tenant/connectors/development',
    'Connector Development',
    ConnectorDevelopmentPage,
  ),
  tenantRoute(
    '/tenant/connectors/builder',
    'Build a Connector',
    ConnectorBuilderPage,
  ),
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
  {
    path: '/tenant/security',
    element: (
      <TenantLayout>
        <PageTitle title="Security">
          <Navigate to="/tenant/security/sso" replace />
        </PageTitle>
      </TenantLayout>
    ),
  },
  tenantRoute('/tenant/security/sso', 'Single Sign On', SSOPage),
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
];
