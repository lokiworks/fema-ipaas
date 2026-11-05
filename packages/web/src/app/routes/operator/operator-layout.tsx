import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { AllowOnlyLoggedInUserOnlyGuard } from '@/app/components/allow-logged-in-user-only-guard';
import { GlobalRail } from '@/app/components/global-rail';
import { GlobalSearchProvider } from '@/app/components/global-search/global-search-context';
import { MobileNavBar } from '@/app/components/project-layout/mobile-nav-bar';
import { SidebarProvider } from '@/components/ui/sidebar-shadcn';
import { operatorHooks } from '@/features/operator';

import { OperatorSidebar } from './operator-sidebar';

export function OperatorLayout({ children }: { children: ReactNode }) {
  return (
    <AllowOnlyLoggedInUserOnlyGuard>
      <OperatorGate>
        <GlobalSearchProvider>
          <SidebarProvider open={true} className="h-svh min-h-0">
            <GlobalRail className="max-md:hidden" />
            <div className="h-full max-md:hidden">
              <OperatorSidebar />
            </div>
            <div
              id="dashboard-content-container"
              className="relative flex min-w-0 flex-1 flex-col overflow-clip bg-background"
            >
              <div className="md:hidden">
                <MobileNavBar showProjectNav={false} showTenantMenu />
              </div>
              <div className="flex flex-1 flex-col overflow-auto">
                {children}
              </div>
            </div>
          </SidebarProvider>
        </GlobalSearchProvider>
      </OperatorGate>
    </AllowOnlyLoggedInUserOnlyGuard>
  );
}

function OperatorGate({ children }: { children: ReactNode }) {
  const isOperator = operatorHooks.useIsOperator();
  if (!isOperator) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
