import { TenantModule } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  BoxesIcon,
  FolderKanbanIcon,
  GaugeIcon,
  InboxIcon,
  ShieldQuestionIcon,
  ArrowUpCircleIcon,
  CalendarOffIcon,
  DatabaseBackupIcon,
  KeyRound as KeyRoundIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  TerminalIcon,
} from 'lucide-react';
import { ComponentType } from 'react';
import { useLocation } from 'react-router-dom';

import { FileHeartIcon } from '@/components/icons/file-heart';
import { FileJson2Icon } from '@/components/icons/file-json2';
import { LayoutGridIcon } from '@/components/icons/layout-grid';
import { LogInIcon } from '@/components/icons/log-in';
import { MousePointerClickIcon } from '@/components/icons/mouse-pointer-click';
import { PuzzleIcon } from '@/components/icons/puzzle';
import { ServerIcon } from '@/components/icons/server';
import { SettingsIcon } from '@/components/icons/settings';
import { UnplugIcon } from '@/components/icons/unplug';
import { UsersIcon } from '@/components/icons/users';
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarSeparator,
} from '@/components/ui/sidebar-shadcn';
import { tenantAccessHooks } from '@/features/tenant-access';
import { useIsTenantAdmin } from '@/hooks/authorization-hooks';
import { cn } from '@/lib/utils';

import { SidebarNavItem } from '../sidebar-nav-item';

export function TenantSidebar({ className }: TenantSidebarProps) {
  const { pathname } = useLocation();
  const isTenantAdmin = useIsTenantAdmin();
  const { data: myAccess } = tenantAccessHooks.useMyAccess();
  const pendingRequests = tenantAccessHooks.usePendingRequestCount();

  const isConnectorsModule = tenantSidebarUtils.isConnectorsModule(pathname);
  const adminGroups: SidebarGroupConfig[] = [
    {
      label: t('General'),
      items: [
        {
          to: '/tenant/projects',
          label: t('Projects'),
          icon: LayoutGridIcon,
        },
        {
          to: '/tenant/users',
          label: t('Users'),
          icon: UsersIcon,
        },
        {
          to: '/tenant/access/requests',
          label: t('Permission requests'),
          icon: InboxIcon,
          badge: pendingRequests > 0 ? String(pendingRequests) : undefined,
        },
        {
          to: '/tenant/access/settings',
          label: t('Permission settings'),
          icon: ShieldQuestionIcon,
        },
        {
          to: '/tenant/connections',
          label: t('All connections'),
          icon: UnplugIcon,
        },
        {
          to: '/tenant/resources',
          label: t('Integration resources'),
          icon: BoxesIcon,
        },
        {
          to: '/tenant/limits/projects',
          label: t('Projects and limits'),
          icon: FolderKanbanIcon,
        },
      ],
    },
    {
      label: t('Usage'),
      items: [
        {
          to: '/tenant/limits/usage',
          label: t('Usage and limits'),
          icon: GaugeIcon,
        },
      ],
    },
    {
      label: t('Setup'),
      items: [
        {
          to: '/tenant/setup/general',
          label: t('General'),
          icon: SettingsIcon,
        },
        {
          to: '/tenant/setup/connections',
          label: t('Global Connections'),
          icon: UnplugIcon,
        },
        {
          to: '/tenant/setup/connectors',
          label: t('Installed connectors'),
          icon: PuzzleIcon,
        },
        {
          to: '/tenant/setup/templates',
          label: t('Templates'),
          icon: LayoutGridIcon,
        },
        {
          to: '/tenant/setup/holidays',
          label: t('Holiday calendar'),
          icon: CalendarOffIcon,
        },
      ],
    },
    {
      label: t('Security'),
      items: [
        {
          to: '/tenant/audit',
          label: t('Audit Log'),
          icon: ScrollTextIcon,
        },
        {
          to: '/tenant/security/authentication',
          label: t('Sign-in and security'),
          icon: LogInIcon,
        },
        {
          to: '/tenant/security/encryption',
          label: t('Encryption'),
          icon: KeyRoundIcon,
        },
        {
          to: '/tenant/security/privacy',
          label: t('Data and privacy'),
          icon: ShieldCheckIcon,
        },
      ],
    },
    {
      label: t('Infrastructure'),
      items: [
        {
          to: '/tenant/infra/workers',
          label: t('Workers'),
          icon: ServerIcon,
        },
        {
          to: '/tenant/infra/health',
          label: t('Health'),
          icon: FileHeartIcon,
        },
        {
          to: '/tenant/infra/triggers',
          label: t('Triggers'),
          icon: MousePointerClickIcon,
        },
        {
          to: '/tenant/infra/system',
          label: t('System and upgrades'),
          icon: ArrowUpCircleIcon,
        },
        {
          to: '/tenant/infra/backup',
          label: t('Backup and restore'),
          icon: DatabaseBackupIcon,
        },
      ],
    },
  ];
  const connectorGroups: SidebarGroupConfig[] = [
    {
      items: [
        {
          to: '/tenant/connectors',
          label: t('Connector Marketplace'),
          icon: PuzzleIcon,
        },
        {
          to: '/tenant/connectors/requests',
          label: t('Connector requests'),
          icon: InboxIcon,
        },
        {
          to: '/tenant/connectors/development',
          label: t('Connector Development'),
          icon: TerminalIcon,
          module: TenantModule.CONNECTOR_DEVELOPMENT,
        },
        {
          to: '/tenant/connectors/openapi',
          label: t('Import from OpenAPI'),
          icon: FileJson2Icon,
          module: TenantModule.CONNECTOR_DEVELOPMENT,
        },
      ],
    },
  ];
  const allGroups = isConnectorsModule ? connectorGroups : adminGroups;
  const groups = isTenantAdmin
    ? allGroups
    : allGroups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              item.module !== undefined &&
              (myAccess?.modules ?? []).includes(item.module),
          ),
        }))
        .filter((group) => group.items.length > 0);

  const activeTo = tenantSidebarUtils.findActiveTo({
    pathname,
    paths: groups.flatMap((group) => group.items.map((item) => item.to)),
  });

  return (
    <Sidebar
      collapsible="none"
      className={cn('w-[220px] shrink-0 border-r', className)}
    >
      <div className="px-4 pb-1 pt-4 text-base font-semibold">
        {isConnectorsModule ? t('Connectors') : t('Tenant Admin')}
      </div>
      <div className="flex-1 overflow-y-auto">
        <SidebarContent className="gap-0">
          {groups.map((group, idx) => (
            <SidebarGroup
              key={group.label ?? 'items'}
              className="cursor-default shrink-0"
            >
              {idx > 0 && <SidebarSeparator className="mb-3" />}
              {group.label && (
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarNavItem
                      type="link"
                      key={item.label}
                      to={item.to}
                      label={item.label}
                      icon={item.icon}
                      badge={item.badge}
                      active={item.to === activeTo}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </div>
    </Sidebar>
  );
}

function findActiveTo({ pathname, paths }: FindActiveToParams): string | null {
  const matches = paths.filter(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  return matches.reduce<string | null>(
    (longest, path) =>
      longest === null || path.length > longest.length ? path : longest,
    null,
  );
}

const CONNECTORS_MODULE_PREFIX = '/tenant/connectors';

function isConnectorsModule(pathname: string): boolean {
  return pathname.startsWith(CONNECTORS_MODULE_PREFIX);
}

const tenantSidebarUtils = { findActiveTo, isConnectorsModule };

type SidebarGroupConfig = {
  label?: string;
  items: {
    to: string;
    label: string;
    icon?: ComponentType<{ className?: string }>;
    badge?: string;
    module?: TenantModule;
  }[];
};

type FindActiveToParams = {
  pathname: string;
  paths: string[];
};

type TenantSidebarProps = {
  className?: string;
};

export { tenantSidebarUtils };
