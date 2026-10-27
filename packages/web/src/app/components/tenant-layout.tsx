import { TenantModule } from '@fema-ipaas/shared';
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { SidebarProvider } from '@/components/ui/sidebar-shadcn';
import { ModuleGate } from '@/features/tenant-access';
import { useIsTenantAdmin } from '@/hooks/authorization-hooks';

import { AllowOnlyLoggedInUserOnlyGuard } from './allow-logged-in-user-only-guard';
import { GlobalRail } from './global-rail';
import { GlobalSearchProvider } from './global-search/global-search-context';
import { MobileNavBar } from './project-layout/mobile-nav-bar';
import { TenantSidebar } from './sidebar/tenant';

export function TenantLayout({ children }: { children: React.ReactNode }) {
  const isTenantAdmin = useIsTenantAdmin();
  const { pathname } = useLocation();
  const moduleRoute = MODULE_ROUTES.find((route) =>
    pathname.startsWith(route.prefix),
  );
  const showTenantAdminDashboard = isTenantAdmin || moduleRoute !== undefined;

  return (
    <AllowOnlyLoggedInUserOnlyGuard>
      <GlobalSearchProvider>
        {showTenantAdminDashboard ? (
          <SidebarProvider open={true} className="h-svh min-h-0">
            <GlobalRail className="max-md:hidden" />
            <div className="h-full max-md:hidden">
              <TenantSidebar />
            </div>
            <div
              id="dashboard-content-container"
              className="relative flex min-w-0 flex-1 flex-col overflow-clip bg-background"
            >
              <div className="md:hidden">
                <MobileNavBar showProjectNav={false} showTenantMenu />
              </div>
              <div className="flex flex-1 flex-col overflow-auto">
                {moduleRoute ? (
                  <ModuleGate module={moduleRoute.module}>
                    {children}
                  </ModuleGate>
                ) : (
                  children
                )}
              </div>
            </div>
          </SidebarProvider>
        ) : (
          <Navigate to="/" />
        )}
      </GlobalSearchProvider>
    </AllowOnlyLoggedInUserOnlyGuard>
  );
}

const MODULE_ROUTES = [
  {
    prefix: '/tenant/connectors/development',
    module: TenantModule.CONNECTOR_DEVELOPMENT,
  },
  {
    prefix: '/tenant/connectors/builder',
    module: TenantModule.CONNECTOR_DEVELOPMENT,
  },
  {
    prefix: '/tenant/connectors/openapi',
    module: TenantModule.CONNECTOR_DEVELOPMENT,
  },
];
