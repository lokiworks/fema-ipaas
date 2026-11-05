import React, { Suspense } from 'react';
import { Navigate } from 'react-router-dom';

import { PageTitle } from '@/app/components/page-title';
import { RouteLoadingBar } from '@/components/custom/route-loading-bar';

import { OperatorLayout } from './operator/operator-layout';

const OperatorTenantsPage = React.lazy(() =>
  import('./operator/tenants').then((m) => ({
    default: m.OperatorTenantsPage,
  })),
);
const OperatorTenantDetailPage = React.lazy(() =>
  import('./operator/tenants/detail').then((m) => ({
    default: m.OperatorTenantDetailPage,
  })),
);
const OperatorPlatformClientsPage = React.lazy(() =>
  import('./operator/platform-clients').then((m) => ({
    default: m.OperatorPlatformClientsPage,
  })),
);
const OperatorSettingsPage = React.lazy(() =>
  import('./operator/settings').then((m) => ({
    default: m.OperatorSettingsPage,
  })),
);
const OperatorOperatorsPage = React.lazy(() =>
  import('./operator/operators').then((m) => ({
    default: m.OperatorOperatorsPage,
  })),
);

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteLoadingBar />}>{children}</Suspense>;
}

function operatorRoute(path: string, title: string, Page: React.ComponentType) {
  return {
    path,
    element: (
      <OperatorLayout>
        <PageTitle title={title}>
          <SuspenseWrapper>
            <Page />
          </SuspenseWrapper>
        </PageTitle>
      </OperatorLayout>
    ),
  };
}

export const operatorRoutes = [
  {
    path: '/operator',
    element: <Navigate to="/operator/tenants" replace />,
  },
  operatorRoute('/operator/tenants', 'Tenants', OperatorTenantsPage),
  operatorRoute(
    '/operator/tenants/:tenantId',
    'Tenant',
    OperatorTenantDetailPage,
  ),
  operatorRoute(
    '/operator/platform-clients',
    'Platform clients',
    OperatorPlatformClientsPage,
  ),
  operatorRoute(
    '/operator/settings',
    'Instance settings',
    OperatorSettingsPage,
  ),
  operatorRoute('/operator/operators', 'Operators', OperatorOperatorsPage),
];
