import { TenantModule } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  BoxesIcon,
  FolderKanbanIcon,
  GaugeIcon,
  InboxIcon,
  ShieldQuestionIcon,
  ArrowUpCircleIcon,
  BellRingIcon,
  CalendarOffIcon,
  DatabaseBackupIcon,
  KeyRound as KeyRoundIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  TerminalIcon,
} from 'lucide-react';
import { ComponentType, useRef } from 'react';
import { Link } from 'react-router-dom';

import {
  ChevronLeftIcon,
  ChevronLeftIconHandle,
} from '@/components/icons/chevron-left';
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
import { buttonVariants } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarSeparator,
} from '@/components/ui/sidebar-shadcn';
import { tenantAccessHooks } from '@/features/tenant-access';
import {
  useAuthorization,
  useIsTenantAdmin,
} from '@/hooks/authorization-hooks';
import { determineDefaultRoute } from '@/lib/route-utils';
import { cn } from '@/lib/utils';

import { SidebarNavItem } from '../sidebar-nav-item';
import { SidebarUser } from '../sidebar-user';

export function TenantSidebar() {
  const { checkAccess } = useAuthorization();
  const defaultRoute = determineDefaultRoute({
    checkAccess,
  });
  const chevronRef = useRef<ChevronLeftIconHandle>(null);

  const isTenantAdmin = useIsTenantAdmin();
  const { data: myAccess } = tenantAccessHooks.useMyAccess();
  const pendingRequests = tenantAccessHooks.usePendingRequestCount();

  const allGroups: {
    label: string;
    items: {
      to: string;
      label: string;
      icon?: ComponentType<{ className?: string }>;
      badge?: string;
      module?: TenantModule;
    }[];
  }[] = [
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
          label: t('Connections'),
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
      label: t('Connectors'),
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
          label: t('Connectors'),
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
        {
          to: '/tenant/alerts',
          label: t('Alerts'),
          icon: BellRingIcon,
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

  return (
    <Sidebar className="border-r-0!">
      <SidebarHeader className="pb-0">
        <Link
          to={defaultRoute}
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            'w-full justify-start gap-2 px-2',
          )}
          onMouseEnter={() => chevronRef.current?.startAnimation()}
          onMouseLeave={() => chevronRef.current?.stopAnimation()}
        >
          <ChevronLeftIcon ref={chevronRef} className="size-4" size={16} />
          <span className="truncate text-sm">{t('Back to app')}</span>
        </Link>
      </SidebarHeader>
      <div className="flex-1 overflow-y-auto">
        <SidebarContent className="gap-0">
          {groups.map((group, idx) => (
            <SidebarGroup key={group.label} className="cursor-default shrink-0">
              {idx > 0 && <SidebarSeparator className="mb-3" />}
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
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
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </div>

      <SidebarFooter>
        <SidebarUser />
      </SidebarFooter>
    </Sidebar>
  );
}
