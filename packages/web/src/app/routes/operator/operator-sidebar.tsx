import { t } from 'i18next';
import {
  BuildingIcon,
  DatabaseBackupIcon,
  KeyRoundIcon,
  ServerIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { ComponentType } from 'react';
import { useLocation } from 'react-router-dom';

import { SidebarNavItem } from '@/app/components/sidebar/sidebar-nav-item';
import { FileHeartIcon } from '@/components/icons/file-heart';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarSeparator,
} from '@/components/ui/sidebar-shadcn';
import { cn } from '@/lib/utils';

export function OperatorSidebar({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const groups = buildGroups();
  const activeTo = findActiveTo({
    pathname,
    paths: groups.flatMap((group) => group.items.map((item) => item.to)),
  });

  return (
    <Sidebar
      collapsible="none"
      className={cn('w-[220px] shrink-0 border-r', className)}
    >
      <div className="px-4 pb-1 pt-4 text-base font-semibold">
        {t('Operations')}
      </div>
      <div className="flex-1 overflow-y-auto">
        <SidebarContent className="gap-0">
          {groups.map((group, index) => (
            <SidebarGroup key={group.label} className="shrink-0 cursor-default">
              {index > 0 && <SidebarSeparator className="mb-3" />}
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarNavItem
                      type="link"
                      key={item.to}
                      to={item.to}
                      label={item.label}
                      icon={item.icon}
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

function buildGroups(): OperatorSidebarGroup[] {
  return [
    {
      label: t('Tenants'),
      items: [
        { to: '/operator/tenants', label: t('Tenants'), icon: BuildingIcon },
        {
          to: '/operator/platform-clients',
          label: t('Platform clients'),
          icon: KeyRoundIcon,
        },
      ],
    },
    {
      label: t('Instance'),
      items: [
        {
          to: '/operator/settings',
          label: t('Instance settings'),
          icon: SlidersHorizontalIcon,
        },
        {
          to: '/operator/operators',
          label: t('Operators'),
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
          to: '/tenant/infra/backup',
          label: t('Backup and restore'),
          icon: DatabaseBackupIcon,
        },
      ],
    },
  ];
}

function findActiveTo({
  pathname,
  paths,
}: {
  pathname: string;
  paths: string[];
}): string | null {
  return paths
    .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
    .reduce<string | null>(
      (longest, path) =>
        longest === null || path.length > longest.length ? path : longest,
      null,
    );
}

type OperatorSidebarGroup = {
  label: string;
  items: {
    to: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
  }[];
};
