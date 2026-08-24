import { isNil } from '@fema-ipaas/core-utils';
import React, { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';

import { BotIcon } from '@/components/icons/bot';
import { ChartLineIcon } from '@/components/icons/chart-line';
import { CompassIcon } from '@/components/icons/compass';
import { useEmbedding } from '@/components/providers/embed-provider';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar-shadcn';
import { workspaceHooks } from '@/features/workspaces';
import { cn } from '@/lib/utils';

import { authenticationSession } from '../../../lib/authentication-session';
import {
  GlobalSearchProvider,
  useGlobalSearch,
} from '../global-search/global-search-context';
import { WorkspaceDashboardSidebar } from '../sidebar/dashboard';

import { WorkspaceDashboardLayoutHeader } from './workspace-dashboard-layout-header';

export type WorkspaceDashboardLayoutHeaderTab = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  hasPermission: boolean;
  show: boolean;
  beta?: boolean;
  children?: { to: string; label: string }[];
};

const WorkspaceChangedRedirector = ({
  currentWorkspaceId,
  children,
}: {
  currentWorkspaceId: string;
  children: React.ReactNode;
}) => {
  workspaceHooks.useReloadPageIfWorkspaceIdChanged(currentWorkspaceId);
  return children;
};

export function WorkspaceDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentWorkspaceId = authenticationSession.getWorkspaceId();
  const { t } = useTranslation();
  const location = useLocation();
  const isTenantPage = location.pathname.includes('/tenant/');
  const isEmbedded = useEmbedding().embedState.isEmbedded;
  if (isNil(currentWorkspaceId) || currentWorkspaceId === '') {
    return <Navigate to="/sign-in" replace />;
  }

  const itemsWithoutHeader: WorkspaceDashboardLayoutHeaderTab[] = [
    {
      to: '/templates',
      label: t('Explore'),
      show: !isEmbedded,
      icon: CompassIcon,
      hasPermission: true,
    },
    {
      to: '/impact',
      label: t('Impact'),
      show: !isEmbedded,
      icon: ChartLineIcon,
      hasPermission: true,
    },
    {
      to: '/chat',
      label: t('Chat'),
      show: !isEmbedded,
      icon: CompassIcon,
      hasPermission: true,
    },
    {
      to: '/agents',
      label: t('Agents'),
      show: !isEmbedded,
      icon: BotIcon,
      hasPermission: true,
    },
  ];

  const hideHeader =
    itemsWithoutHeader.some((item) => location.pathname.includes(item.to)) ||
    isTenantPage;

  return (
    <WorkspaceChangedRedirector currentWorkspaceId={currentWorkspaceId}>
      <GlobalSearchProvider>
        <WorkspaceDashboardLayoutInner
          hideHeader={hideHeader}
          isEmbedded={isEmbedded}
          currentWorkspaceId={currentWorkspaceId}
        >
          {children}
        </WorkspaceDashboardLayoutInner>
      </GlobalSearchProvider>
    </WorkspaceChangedRedirector>
  );
}

function WorkspaceDashboardLayoutInner({
  hideHeader,
  isEmbedded,
  currentWorkspaceId,
  children,
}: {
  hideHeader: boolean;
  isEmbedded: boolean;
  currentWorkspaceId: string;
  children: React.ReactNode;
}) {
  const { open: searchOpen } = useGlobalSearch();

  return (
    <SidebarProvider defaultOpen={false} hoverMode={!searchOpen}>
      {!isEmbedded && <WorkspaceDashboardSidebar />}
      <SidebarInset className="flex flex-col h-full overflow-hidden bg-sidebar">
        <div
          className={cn(
            'flex-1 flex flex-col overflow-hidden',
            !isEmbedded && 'pr-2 pt-3 pb-3',
          )}
        >
          <div
            id="dashboard-content-container"
            className={cn(
              'relative flex flex-col h-full bg-background overflow-clip',
              !isEmbedded &&
                'rounded-xl shadow-[2px_0px_4px_-2px_rgba(0,0,0,0.05),0px_2px_4px_-2px_rgba(0,0,0,0.05)] border',
            )}
          >
            {!hideHeader && (
              <WorkspaceDashboardLayoutHeader key={currentWorkspaceId} />
            )}
            <div className="flex-1 overflow-auto">{children}</div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
