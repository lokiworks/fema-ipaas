import { t } from 'i18next';
import { ScrollTextIcon, TerminalIcon } from 'lucide-react';
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
import { useAuthorization } from '@/hooks/authorization-hooks';
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

  const groups: {
    label: string;
    items: {
      to: string;
      label: string;
      icon?: ComponentType<{ className?: string }>;
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
          to: '/tenant/connections',
          label: t('Connections'),
          icon: UnplugIcon,
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
          to: '/tenant/connectors/development',
          label: t('Connector Development'),
          icon: TerminalIcon,
        },
        {
          to: '/tenant/connectors/builder',
          label: t('Build a Connector'),
          icon: MousePointerClickIcon,
        },
        {
          to: '/tenant/connectors/openapi',
          label: t('Import from OpenAPI'),
          icon: FileJson2Icon,
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
          label: t('Authentication'),
          icon: LogInIcon,
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
      ],
    },
  ];

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
