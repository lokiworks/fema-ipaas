import { isNil } from '@fema-ipaas/core-utils';
import React, { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';

import { BotIcon } from '@/components/icons/bot';
import { ChartLineIcon } from '@/components/icons/chart-line';
import { CompassIcon } from '@/components/icons/compass';
import { useEmbedding } from '@/components/providers/embed-provider';
import { SidebarProvider } from '@/components/ui/sidebar-shadcn';
import { projectHooks } from '@/features/projects';
import { useIsCompact, useIsMobile } from '@/hooks/use-mobile';

import { authenticationSession } from '../../../lib/authentication-session';
import { GlobalRail } from '../global-rail';
import { GlobalSearchProvider } from '../global-search/global-search-context';

import { MobileNavBar } from './mobile-nav-bar';
import { ProjectNavColumn } from './project-nav-column';

export type ProjectDashboardLayoutHeaderTab = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  hasPermission: boolean;
  show: boolean;
  beta?: boolean;
  children?: { to: string; label: string }[];
};

const ProjectChangedRedirector = ({
  currentProjectId,
  children,
}: {
  currentProjectId: string;
  children: React.ReactNode;
}) => {
  projectHooks.useReloadPageIfProjectIdChanged(currentProjectId);
  return children;
};

export function ProjectDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentProjectId = authenticationSession.getProjectId();
  const { t } = useTranslation();
  const location = useLocation();
  const isTenantPage = location.pathname.includes('/tenant/');
  const isEmbedded = useEmbedding().embedState.isEmbedded;
  if (isNil(currentProjectId) || currentProjectId === '') {
    return <Navigate to="/sign-in" replace />;
  }

  const itemsWithoutHeader: ProjectDashboardLayoutHeaderTab[] = [
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
    location.pathname.endsWith('/connections') ||
    isTenantPage ||
    PROJECTLESS_PATHS.includes(location.pathname) ||
    location.pathname.startsWith(SOLUTIONS_PATH);

  return (
    <ProjectChangedRedirector currentProjectId={currentProjectId}>
      <GlobalSearchProvider>
        <ProjectDashboardLayoutInner
          hideHeader={hideHeader}
          isEmbedded={isEmbedded}
        >
          {children}
        </ProjectDashboardLayoutInner>
      </GlobalSearchProvider>
    </ProjectChangedRedirector>
  );
}

function ProjectDashboardLayoutInner({
  hideHeader,
  isEmbedded,
  children,
}: {
  hideHeader: boolean;
  isEmbedded: boolean;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const isCompact = useIsCompact();

  return (
    <SidebarProvider defaultOpen={false} className="h-svh min-h-0">
      {!isEmbedded && !isCompact && <GlobalRail />}
      <div
        id="dashboard-content-container"
        className="relative flex min-w-0 flex-1 flex-col overflow-clip bg-background"
      >
        {isCompact && !isEmbedded && (
          <MobileNavBar showProjectNav={!hideHeader} showMenu={isMobile} />
        )}
        <div className="flex min-h-0 flex-1 flex-row">
          {!hideHeader && !isEmbedded && !isCompact && <ProjectNavColumn />}
          <div className="min-w-0 flex-1 overflow-auto">{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );
}

const SOLUTIONS_PATH = '/solutions';

const PROJECTLESS_PATHS = [
  '/',
  '/projects',
  '/logs',
  '/issue-center',
  '/monitor',
  '/account',
];
