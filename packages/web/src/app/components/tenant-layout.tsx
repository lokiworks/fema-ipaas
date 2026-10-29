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
  const fallbackModule = isTenantAdmin
    ? null
    : moduleRoute?.module ?? fallbackModuleOf(pathname);

  return (
    <AllowOnlyLoggedInUserOnlyGuard>
      <GlobalSearchProvider>
        <SidebarProvider open={true} className="h-svh min-h-0">
          <GlobalRail className="max-md:hidden" />
          {(isTenantAdmin || moduleRoute !== undefined) && (
            <div className="h-full max-md:hidden">
              <TenantSidebar />
            </div>
          )}
          <div
            id="dashboard-content-container"
            className="relative flex min-w-0 flex-1 flex-col overflow-clip bg-background"
          >
            <div className="md:hidden">
              <MobileNavBar showProjectNav={false} showTenantMenu />
            </div>
            <div className="flex flex-1 flex-col overflow-auto">
              {fallbackModule === null ? (
                children
              ) : (
                <ModuleGate module={fallbackModule}>
                  {moduleRoute ? (
                    children
                  ) : (
                    <Navigate
                      to={allowedFallbackPath(fallbackModule)}
                      replace
                    />
                  )}
                </ModuleGate>
              )}
            </div>
          </div>
        </SidebarProvider>
      </GlobalSearchProvider>
    </AllowOnlyLoggedInUserOnlyGuard>
  );
}

function fallbackModuleOf(pathname: string): TenantModule {
  return pathname.startsWith(CONNECTORS_PREFIX)
    ? TenantModule.CONNECTOR_DEVELOPMENT
    : TenantModule.PLATFORM_ADMIN;
}

function allowedFallbackPath(module: TenantModule): string {
  return module === TenantModule.CONNECTOR_DEVELOPMENT
    ? '/tenant/connectors/development'
    : '/';
}

const CONNECTORS_PREFIX = '/tenant/connectors';

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
