import { Permission } from '@fema-ipaas/core-utils';
import { ExecutionStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CompassIcon, HouseIcon, PuzzleIcon } from 'lucide-react';
import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ConnectIcon } from '@/components/icons/connect';
import { HistoryIcon } from '@/components/icons/history';
import { VariableIcon } from '@/components/icons/variable';
import { WorkflowIcon } from '@/components/icons/workflow';
import { useEmbedding } from '@/components/providers/embed-provider';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { WorkspaceDashboardPageHeader } from './workspace-dashboard-page-header';

import { WorkspaceDashboardLayoutHeaderTab } from '.';

type AnimatedIconHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

const AnimatedTab = ({
  tab,
  isActive,
  onClick,
}: {
  tab: WorkspaceDashboardLayoutHeaderTab;
  isActive: boolean;
  onClick: () => void;
}) => {
  const iconRef = useRef<AnimatedIconHandle>(null);
  const IconComponent = tab.icon as React.ForwardRefExoticComponent<
    {
      className?: string;
      size?: number;
    } & React.RefAttributes<AnimatedIconHandle>
  >;

  return (
    <TabsTrigger
      value={tab.to}
      variant="outline"
      className="pb-3"
      onClick={onClick}
      data-state={isActive ? 'active' : 'inactive'}
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
    >
      <IconComponent ref={iconRef} size={16} className="mr-2" />
      {tab.label}
      {tab.beta && (
        <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary">
          Beta
        </span>
      )}
    </TabsTrigger>
  );
};

export const WorkspaceDashboardLayoutHeader = () => {
  const { checkAccess } = useAuthorization();
  const { embedState } = useEmbedding();
  const location = useLocation();
  const navigate = useNavigate();
  const isEmbedded = embedState.isEmbedded;

  const primaryTabs: WorkspaceDashboardLayoutHeaderTab[] = [
    {
      to: authenticationSession.appendWorkspaceRoutePrefix('/home'),
      label: t('Home'),
      icon: HouseIcon,
      hasPermission: checkAccess(Permission.READ_RUN),
      show: true,
    },
    {
      to: authenticationSession.appendWorkspaceRoutePrefix('/automations'),
      label: t('Workflows'),
      icon: WorkflowIcon,
      hasPermission: checkAccess(Permission.READ_WORKFLOW),
      show: true,
    },
  ];

  const secondaryTabs: WorkspaceDashboardLayoutHeaderTab[] = [
    {
      to: authenticationSession.appendWorkspaceRoutePrefix('/runs'),
      label: t('Run Center'),
      icon: HistoryIcon,
      hasPermission: checkAccess(Permission.READ_RUN),
      show: true,
      children: [
        {
          to: authenticationSession.appendWorkspaceRoutePrefix('/runs'),
          label: t('All runs'),
        },
        {
          to: `${authenticationSession.appendWorkspaceRoutePrefix(
            '/runs',
          )}?status=${ExecutionStatus.FAILED}`,
          label: t('Failures'),
        },
      ],
    },
    {
      to: authenticationSession.appendWorkspaceRoutePrefix('/connections'),
      label: t('Connections'),
      icon: ConnectIcon,
      hasPermission: checkAccess(Permission.READ_CONNECTION),
      show: true,
    },
    {
      to: '/tenant/connectors',
      label: t('Connectors'),
      icon: PuzzleIcon,
      hasPermission: true,
      show: !isEmbedded,
    },
    {
      to: '/templates',
      label: t('Solutions'),
      icon: CompassIcon,
      hasPermission: true,
      show: !isEmbedded,
    },
    {
      to: authenticationSession.appendWorkspaceRoutePrefix('/variables'),
      label: t('Resources'),
      icon: VariableIcon,
      hasPermission: checkAccess(Permission.READ_VARIABLE),
      show: true,
    },
  ];

  const visiblePrimaryTabs = primaryTabs.filter(
    (tab) => tab.show && tab.hasPermission,
  );
  const visibleSecondaryTabs = secondaryTabs.filter(
    (tab) => tab.show && tab.hasPermission,
  );
  const currentLocation = `${location.pathname}${location.search}`;

  const activeTab = [...visiblePrimaryTabs, ...visibleSecondaryTabs].find(
    (tab) => location.pathname.includes(pathOf(tab.to)),
  );
  const subTabs = activeTab?.children ?? [];

  return (
    <div className="flex flex-col">
      {!isEmbedded && <WorkspaceDashboardPageHeader />}
      {!embedState.hideSideNav && (
        <Tabs className="px-3 pt-2 border-b">
          <TabsList variant="outline">
            {visiblePrimaryTabs.map((tab) => (
              <AnimatedTab
                key={tab.to}
                tab={tab}
                isActive={location.pathname.includes(pathOf(tab.to))}
                onClick={() => navigate(tab.to)}
              />
            ))}
            {visiblePrimaryTabs.length > 0 &&
              visibleSecondaryTabs.length > 0 && (
                <Separator
                  orientation="vertical"
                  className="mx-2 h-5 self-center mb-2"
                />
              )}
            {visibleSecondaryTabs.map((tab) => (
              <AnimatedTab
                key={tab.to}
                tab={tab}
                isActive={location.pathname.includes(pathOf(tab.to))}
                onClick={() => navigate(tab.to)}
              />
            ))}
          </TabsList>
        </Tabs>
      )}
      {!embedState.hideSideNav && subTabs.length > 1 && (
        <div className="flex items-center gap-4 border-b px-5 py-2">
          {subTabs.map((subTab) => (
            <button
              key={subTab.to}
              type="button"
              onClick={() => navigate(subTab.to)}
              className={cn(
                'text-sm text-muted-foreground transition-colors hover:text-foreground',
                {
                  'text-foreground font-medium': currentLocation === subTab.to,
                },
              )}
            >
              {subTab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// A tab's `to` may carry a query string, which never appears in pathname.
function pathOf(to: string): string {
  return to.split('?')[0];
}

WorkspaceDashboardLayoutHeader.displayName = 'WorkspaceDashboardLayoutHeader';

export default WorkspaceDashboardLayoutHeader;
