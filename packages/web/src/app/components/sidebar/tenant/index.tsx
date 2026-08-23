import { t } from 'i18next';
import { ComponentType, useRef } from 'react';
import { Link } from 'react-router-dom';

import { McpSvg } from '@/assets/img/custom/mcp';
import { BotIcon } from '@/components/icons/bot';
import { ChartLineIcon } from '@/components/icons/chart-line';
import {
  ChevronLeftIcon,
  ChevronLeftIconHandle,
} from '@/components/icons/chevron-left';
import { FileHeartIcon } from '@/components/icons/file-heart';
import { FileJson2Icon } from '@/components/icons/file-json2';
import { FrameIcon } from '@/components/icons/frame';
import { KeyRoundIcon } from '@/components/icons/key-round';
import { LayoutGridIcon } from '@/components/icons/layout-grid';
import { LogInIcon } from '@/components/icons/log-in';
import { MousePointerClickIcon } from '@/components/icons/mouse-pointer-click';
import { PuzzleIcon } from '@/components/icons/puzzle';
import { ReceiptIcon } from '@/components/icons/receipt';
import { ServerIcon } from '@/components/icons/server';
import { SettingsIcon } from '@/components/icons/settings';
import { Settings2Icon } from '@/components/icons/settings2';
import { SparklesIcon } from '@/components/icons/sparkles';
import { SquareDashedBottomCodeIcon } from '@/components/icons/square-dashed-bottom-code';
import { UnplugIcon } from '@/components/icons/unplug';
import { UsersIcon } from '@/components/icons/users';
import { WebhookIcon } from '@/components/icons/webhook';
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
import { tenantHooks } from '@/hooks/tenant-hooks';
import { determineDefaultRoute } from '@/lib/route-utils';
import { cn } from '@/lib/utils';

import { ApSidebarItem } from '../ap-sidebar-item';
import { SidebarUser } from '../sidebar-user';

export function TenantSidebar() {
  const { tenant } = tenantHooks.useCurrentTenant();
  const { checkAccess } = useAuthorization();
  const defaultRoute = determineDefaultRoute({
    checkAccess,
    chatEnabled: tenant.plan.chatEnabled,
  });
  const chevronRef = useRef<ChevronLeftIconHandle>(null);

  const setupItems = [
    {
      to: '/tenant/setup/general',
      label: t('General'),
      icon: SettingsIcon,
    },
    {
      to: '/tenant/setup/ai',
      label: t('AI Providers'),
      icon: BotIcon,
    },
    {
      to: '/tenant/setup/ai-capabilities',
      label: t('AI Capabilities'),
      icon: SparklesIcon,
    },
    {
      to: '/tenant/setup/mcp',
      label: t('MCP Server'),
      icon: McpSvg,
    },
    {
      to: '/tenant/setup/connections',
      label: t('Global Connections'),
      icon: UnplugIcon,
      locked: !tenant.plan.globalConnectionsEnabled,
    },
    {
      to: '/tenant/setup/connectors',
      label: t('Connectors'),
      icon: PuzzleIcon,
      locked: !tenant.plan.manageConnectorsEnabled,
    },
    {
      to: '/tenant/setup/templates',
      label: t('Templates'),
      icon: LayoutGridIcon,
      locked: !tenant.plan.manageTemplatesEnabled,
    },
    {
      to: '/tenant/setup/billing',
      label: t('Billing & subscription'),
      icon: ReceiptIcon,
      locked: true,
    },
    {
      to: '/tenant/setup/usage',
      label: t('Usage'),
      icon: ChartLineIcon,
      locked: true,
    },
    {
      to: '/tenant/security/embed',
      label: t('Embedding'),
      icon: FrameIcon,
      locked: !tenant.plan.embeddingEnabled,
    },
  ];

  const groups: {
    label: string;
    items: {
      to: string;
      label: string;
      icon?: ComponentType<{ className?: string }>;
      locked?: boolean;
    }[];
  }[] = [
    {
      label: t('General'),
      items: [
        {
          to: '/tenant/workspaces',
          label: t('Workspaces'),
          icon: LayoutGridIcon,
          locked: tenant.plan.billedTeamWorkspacesLimit === 0,
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
      label: t('Setup'),
      items: setupItems,
    },
    {
      label: t('Security'),
      items: [
        {
          to: '/tenant/security/sso',
          label: t('Single Sign On'),
          icon: LogInIcon,
          locked: !tenant.plan.ssoEnabled,
        },
        {
          to: '/tenant/security/workspace-roles',
          label: t('Workspace Roles'),
          icon: Settings2Icon,
          locked: !tenant.plan.workspaceRolesEnabled,
        },
        {
          to: '/tenant/security/api-keys',
          label: t('API Keys'),
          icon: FileJson2Icon,
          locked: !tenant.plan.apiKeysEnabled,
        },
        {
          to: '/tenant/security/secret-managers',
          label: t('Secret Managers'),
          icon: KeyRoundIcon,
          locked: !tenant.plan.secretManagersEnabled,
        },
      ],
    },
    {
      label: t('Observability'),
      items: [
        {
          to: '/tenant/security/audit-logs',
          label: t('Audit Logs'),
          icon: SquareDashedBottomCodeIcon,
          locked: !tenant.plan.auditLogEnabled,
        },
        {
          to: '/tenant/infrastructure/event-destinations',
          label: t('Event Streaming'),
          icon: WebhookIcon,
          locked: !tenant.plan.eventStreamingEnabled,
        },
      ],
    },
    {
      label: t('Infrastructure'),
      items: [
        {
          to: '/tenant/infrastructure/workers',
          label: t('Workers'),
          icon: ServerIcon,
        },
        {
          to: '/tenant/infrastructure/health',
          label: t('Health'),
          icon: FileHeartIcon,
        },
        {
          to: '/tenant/infrastructure/triggers',
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
                    <ApSidebarItem
                      type="link"
                      key={item.label}
                      to={item.to}
                      label={item.label}
                      icon={item.icon}
                      locked={item.locked}
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
