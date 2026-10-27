import { t } from 'i18next';
import {
  ActivityIcon,
  CheckIcon,
  HouseIcon,
  LayoutGridIcon,
  LayoutTemplateIcon,
  Link2Icon,
  PackageIcon,
  PuzzleIcon,
  ScrollTextIcon,
  SearchIcon,
  ServerCogIcon,
  SettingsIcon,
  SirenIcon,
  WorkflowIcon,
} from 'lucide-react';
import { ComponentType, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { RailButton } from '@/components/custom/rail-button';
import { useEmbedding } from '@/components/providers/embed-provider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { HelpMenu } from '@/features/help';
import { issuesHooks } from '@/features/issues';
import { NotificationBell } from '@/features/notifications';
import { useIsTenantAdmin } from '@/hooks/authorization-hooks';
import { flagsHooks } from '@/hooks/flags-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { useGlobalSearch } from '../global-search/global-search-context';
import { SidebarUser } from '../sidebar/sidebar-user';

export function GlobalRail({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { embedState } = useEmbedding();
  const { setOpen: openSearch } = useGlobalSearch();
  const branding = flagsHooks.useWebsiteBranding();
  const isTenantAdmin = useIsTenantAdmin();
  const projectId = authenticationSession.getProjectId();
  const { data: issueOverview } = issuesHooks.useOverview({
    showErrorDialog: false,
  });
  const openIssueCount = (issueOverview?.projects ?? []).reduce(
    (sum, project) => sum + project.open,
    0,
  );

  if (embedState.hideSideNav) {
    return null;
  }

  const projectPath = (path: string) =>
    projectId ? `/projects/${projectId}${path}` : '/projects';
  const connectionsPath = projectPath('/connections');
  const items = buildItems({ projectPath, connectionsPath, openIssueCount });

  return (
    <aside
      aria-label={t('Main navigation')}
      className={cn(
        'flex h-full w-16 shrink-0 flex-col items-center gap-1 bg-rail py-3',
        className,
      )}
    >
      <button
        type="button"
        aria-label={branding.websiteName}
        onClick={() => navigate('/')}
        className="mb-1 flex size-9 items-center justify-center rounded-md bg-white/95"
      >
        <img
          src={branding.logos.logoIconUrl}
          alt=""
          className="size-5 object-contain"
          draggable={false}
        />
      </button>
      {!embedState.hideGlobalSearch && (
        <RailButton
          icon={SearchIcon}
          label={t('Search')}
          showLabel={false}
          onClick={() => openSearch(true)}
        />
      )}
      <div className="my-1 h-px w-8 bg-rail-accent" />
      <nav className="flex flex-col items-center gap-1">
        {items.map((item) => (
          <RailButton
            key={item.label}
            icon={item.icon}
            label={item.label}
            active={item.isActive(pathname)}
            badge={item.badge}
            onClick={() => navigate(item.to)}
          />
        ))}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-1">
        <HelpMenu />
        <NotificationBell />
        {isTenantAdmin && (
          <RailButton
            icon={SettingsIcon}
            label={t('Settings')}
            active={
              pathname.startsWith('/tenant') &&
              !pathname.startsWith(CONNECTORS_MODULE_PREFIX)
            }
            onClick={() => navigate('/tenant/projects')}
          />
        )}
        <div className="my-1 h-px w-8 bg-rail-accent" />
        <ModuleSwitcher
          projectPath={projectPath}
          isTenantAdmin={isTenantAdmin}
          active={
            pathname.startsWith(CONNECTORS_MODULE_PREFIX) ||
            MCP_MODULE_PATTERN.test(pathname)
          }
        />
        <SidebarUser />
      </div>
    </aside>
  );
}

function buildItems({
  projectPath,
  connectionsPath,
  openIssueCount,
}: {
  projectPath: (path: string) => string;
  connectionsPath: string;
  openIssueCount: number;
}): RailItem[] {
  return [
    {
      to: '/',
      label: t('Home'),
      icon: HouseIcon,
      isActive: (path) => path === '/',
    },
    {
      to: projectPath('/home'),
      label: t('Integration'),
      icon: WorkflowIcon,
      isActive: (path) =>
        path.startsWith('/projects') &&
        !path.endsWith('/connections') &&
        !MCP_MODULE_PATTERN.test(path) &&
        !PROJECT_ISSUES_PATTERN.test(path) &&
        !PROJECT_RUNS_PATTERN.test(path),
    },
    {
      to: '/logs',
      label: t('Logs'),
      icon: ScrollTextIcon,
      isActive: (path) =>
        path.startsWith('/logs') || PROJECT_RUNS_PATTERN.test(path),
    },
    {
      to: '/issue-center',
      label: t('Issues'),
      icon: SirenIcon,
      isActive: (path) =>
        path.startsWith('/issue-center') || PROJECT_ISSUES_PATTERN.test(path),
      badge: openIssueCount,
    },
    {
      to: connectionsPath,
      label: t('Connections'),
      icon: Link2Icon,
      isActive: (path) => path === connectionsPath,
    },
    {
      to: '/monitor',
      label: t('Monitoring'),
      icon: ActivityIcon,
      isActive: (path) => path.startsWith('/monitor'),
    },
    {
      to: '/templates',
      label: t('Templates'),
      icon: LayoutTemplateIcon,
      isActive: (path) => path.startsWith('/templates'),
    },
    {
      to: '/solutions',
      label: t('Solutions'),
      icon: PackageIcon,
      isActive: (path) => path.startsWith('/solutions'),
    },
  ];
}

function ModuleSwitcher({
  projectPath,
  isTenantAdmin,
  active,
}: {
  projectPath: (path: string) => string;
  isTenantAdmin: boolean;
  active: boolean;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const currentModuleKey = currentModuleKeyOf(pathname);
  const modules: ModuleEntry[] = [
    {
      key: 'integration',
      label: t('Business integration'),
      description: t('Build and run workflows'),
      icon: WorkflowIcon,
      color: 'bg-primary',
      to: '/',
      show: true,
    },
    {
      key: 'connectors',
      label: t('Connectors'),
      description: t('Browse connectors and build your own'),
      icon: PuzzleIcon,
      color: 'bg-success',
      to: '/tenant/connectors',
      show: true,
    },
    {
      key: 'mcp',
      label: t('MCP services'),
      description: t('Open connectors and workflows to AI assistants'),
      icon: ServerCogIcon,
      color: 'bg-sky-500',
      to: projectPath('/mcp-services'),
      show: true,
    },
    {
      key: 'admin',
      label: t('Tenant Admin'),
      description: t('Members, permissions, security and platform settings'),
      icon: SettingsIcon,
      color: 'bg-neutral-500',
      to: '/tenant/projects',
      show: isTenantAdmin,
    },
  ];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <RailButton
          icon={LayoutGridIcon}
          label={t('Switch function module')}
          showLabel={false}
          active={active}
        />
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={10}
        className="w-[340px] p-3"
      >
        <div className="mb-2 text-sm font-medium">
          {t('Switch function module')}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {modules
            .filter((entry) => entry.show)
            .map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-current={entry.key === currentModuleKey}
                className={cn(
                  'relative flex flex-col items-start gap-1.5 rounded-md p-2.5 text-left hover:bg-accent',
                  entry.key === currentModuleKey && 'bg-accent',
                )}
                onClick={() => {
                  setOpen(false);
                  navigate(entry.to);
                }}
              >
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md text-white',
                    entry.color,
                  )}
                >
                  <entry.icon className="size-[18px]" />
                </span>
                {entry.key === currentModuleKey && (
                  <span className="absolute right-2 top-2 flex items-center gap-1 text-xs font-medium text-primary">
                    <CheckIcon className="size-3.5" />
                    {t('Current')}
                  </span>
                )}
                <span className="text-sm font-medium">{entry.label}</span>
                <span className="text-xs text-muted-foreground">
                  {entry.description}
                </span>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function currentModuleKeyOf(pathname: string): ModuleEntry['key'] {
  if (pathname.startsWith(CONNECTORS_MODULE_PREFIX)) {
    return 'connectors';
  }
  if (MCP_MODULE_PATTERN.test(pathname)) {
    return 'mcp';
  }
  if (pathname.startsWith('/tenant')) {
    return 'admin';
  }
  return 'integration';
}

const CONNECTORS_MODULE_PREFIX = '/tenant/connectors';
const MCP_MODULE_PATTERN = /^\/projects\/[^/]+\/mcp-services/;
const PROJECT_ISSUES_PATTERN = /^\/projects\/[^/]+\/issues(\/|$)/;
const PROJECT_RUNS_PATTERN = /^\/projects\/[^/]+\/runs(\/|$)/;

type RailItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  isActive: (path: string) => boolean;
  badge?: number;
};

type ModuleEntry = {
  key: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  to: string;
  show: boolean;
};
