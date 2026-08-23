import React, { Suspense } from 'react';
import { Navigate } from 'react-router-dom';

import { PageTitle } from '@/app/components/page-title';
import { RouteLoadingBar } from '@/components/custom/route-loading-bar';

import { PlatformLayout } from '../components/platform-layout';

const SettingsHealthPage = React.lazy(() => import('./platform/infra/health'));
const TriggerHealthPage = React.lazy(() => import('./platform/infra/triggers'));
const SettingsWorkersPage = React.lazy(
  () => import('./platform/infra/workers'),
);
const WorkspacesPage = React.lazy(() => import('./platform/workspaces'));
const SSOPage = React.lazy(() =>
  import('./platform/security/sso').then((m) => ({ default: m.SSOPage })),
);
const GeneralPage = React.lazy(() =>
  import('./platform/setup/general').then((m) => ({
    default: m.GeneralPage,
  })),
);
const GlobalConnectionsTable = React.lazy(() =>
  import('./platform/setup/connections').then((m) => ({
    default: m.GlobalConnectionsTable,
  })),
);
const PlatformConnectorsPage = React.lazy(() =>
  import('./platform/setup/connectors').then((m) => ({
    default: m.PlatformConnectorsPage,
  })),
);
const PlatformTemplatesPage = React.lazy(() =>
  import('./platform/setup/templates').then((m) => ({
    default: m.PlatformTemplatesPage,
  })),
);
const UsersPage = React.lazy(() => import('./platform/users'));
const PlatformConnectionsPage = React.lazy(
  () => import('./platform/connections'),
);

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteLoadingBar />}>{children}</Suspense>;
}

function platformRoute(path: string, title: string, Page: React.ComponentType) {
  return {
    path,
    element: (
      <PlatformLayout>
        <PageTitle title={title}>
          <SuspenseWrapper>
            <Page />
          </SuspenseWrapper>
        </PageTitle>
      </PlatformLayout>
    ),
  };
}

export const platformRoutes = [
  {
    path: '/platform',
    element: (
      <PlatformLayout>
        <PageTitle title="Platform">
          <Navigate to="/platform/workspaces" />
        </PageTitle>
      </PlatformLayout>
    ),
  },
  platformRoute('/platform/workspaces', 'Workspaces', WorkspacesPage),
  platformRoute('/platform/users', 'Members', UsersPage),
  platformRoute(
    '/platform/connections',
    'Connections',
    PlatformConnectionsPage,
  ),
  {
    path: '/platform/setup',
    element: (
      <PlatformLayout>
        <PageTitle title="Platform Setup">
          <Navigate to="/platform/setup/general" replace />
        </PageTitle>
      </PlatformLayout>
    ),
  },
  platformRoute('/platform/setup/general', 'General', GeneralPage),
  platformRoute(
    '/platform/setup/connectors',
    'Connectors',
    PlatformConnectorsPage,
  ),
  platformRoute(
    '/platform/setup/connections',
    'Global Connections',
    GlobalConnectionsTable,
  ),
  platformRoute(
    '/platform/setup/templates',
    'Templates',
    PlatformTemplatesPage,
  ),
  {
    path: '/platform/security',
    element: (
      <PlatformLayout>
        <PageTitle title="Security">
          <Navigate to="/platform/security/sso" replace />
        </PageTitle>
      </PlatformLayout>
    ),
  },
  platformRoute('/platform/security/sso', 'Single Sign On', SSOPage),
  {
    path: '/platform/infra',
    element: (
      <PlatformLayout>
        <PageTitle title="Infrastructure">
          <Navigate to="/platform/infra/health" replace />
        </PageTitle>
      </PlatformLayout>
    ),
  },
  platformRoute('/platform/infra/health', 'System Health', SettingsHealthPage),
  platformRoute('/platform/infra/triggers', 'Triggers', TriggerHealthPage),
  platformRoute('/platform/infra/workers', 'Workers', SettingsWorkersPage),
];
