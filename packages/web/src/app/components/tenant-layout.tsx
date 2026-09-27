import { TenantModule } from '@fema-ipaas/shared';
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar-shadcn';
import { ModuleGate } from '@/features/tenant-access';
import { useIsTenantAdmin } from '@/hooks/authorization-hooks';

import { AllowOnlyLoggedInUserOnlyGuard } from './allow-logged-in-user-only-guard';
import { GlobalSearchProvider } from './global-search/global-search-context';
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
          <SidebarProvider open={true}>
            <TenantSidebar />
            <SidebarInset className="flex flex-col h-full overflow-hidden bg-sidebar">
              <div className="flex-1 flex flex-col p-2 pt-3 pb-3 overflow-hidden">
                <div
                  id="dashboard-content-container"
                  className="relative flex flex-col h-full bg-background rounded-xl shadow-[2px_0px_4px_-2px_rgba(0,0,0,0.05),0px_2px_4px_-2px_rgba(0,0,0,0.05)] border overflow-clip"
                >
                  <div className="flex flex-col flex-1 overflow-auto">
                    {moduleRoute ? (
                      <ModuleGate module={moduleRoute.module}>
                        {children}
                      </ModuleGate>
                    ) : (
                      children
                    )}
                  </div>
                </div>
              </div>
            </SidebarInset>
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
