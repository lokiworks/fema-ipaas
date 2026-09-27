import { ProjectIcon } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  Check,
  ChevronDown,
  CopyPlus,
  Info,
  LayoutDashboard,
  LayoutGrid,
  Plus,
  Share2,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { SearchInput } from '@/components/custom/search-input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ActionMenu,
  ActionMenuEntry,
} from '@/features/project-workspace/components/action-menu';
import { ProjectInfoDialog } from '@/features/project-workspace/components/project-info-dialog';
import {
  CopyProjectDialog,
  DeleteProjectDialog,
} from '@/features/project-workspace/components/project-lifecycle-dialogs';
import { ProjectMark } from '@/features/project-workspace/components/project-mark';
import { WorkflowTree } from '@/features/project-workspace/components/workflow-tree';
import { useWorkspaceContext } from '@/features/project-workspace/hooks/use-workspace-context';
import { projectRoleLabels } from '@/features/project-workspace/lib/role-labels';
import { workspaceUtils } from '@/features/project-workspace/lib/workspace-utils';
import {
  projectDirectoryHooks,
  projectDirectoryUtils,
} from '@/features/projects/api/project-directory-api';
import { projectCollectionUtils } from '@/features/projects/stores/project-collection';
import { releasesHooks } from '@/features/releases/hooks/releases-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { ProjectSettingsDialog } from '../project-settings';

import { pathOf, useProjectNavTabs } from './use-project-nav-tabs';

import { ProjectDashboardLayoutHeaderTab } from '.';

export function ProjectNavColumn() {
  const { project } = projectCollectionUtils.useCurrentProject();
  if (!project) {
    return null;
  }
  return <ProjectSidebar />;
}

function ProjectSidebar() {
  const { project } = projectCollectionUtils.useCurrentProject();
  const { primaryTabs, secondaryTabs } = useProjectNavTabs();
  const context = useWorkspaceContext(project);
  const location = useLocation();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<SidebarDialog | null>(null);
  const { data: pendingForMe } = releasesHooks.usePendingCount(project.id);
  const pendingCount = pendingForMe?.count ?? 0;
  const currentLocation = `${location.pathname}${location.search}`;
  const { canEdit, isOwner } = context.permissions;
  const close = () => setDialog(null);

  const renderTab = (tab: ProjectDashboardLayoutHeaderTab) => {
    const isActive = location.pathname.includes(pathOf(tab.to));
    const subTabs = tab.children ?? [];
    const Icon = tab.icon;
    const showBadge = pathOf(tab.to).endsWith('/releases') && pendingCount > 0;
    return (
      <div key={tab.to} className="flex flex-col">
        <button
          type="button"
          onClick={() => navigate(tab.to)}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
            'text-muted-foreground hover:bg-muted hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isActive && 'bg-muted font-medium text-foreground',
          )}
          aria-label={
            showBadge
              ? t('{label}, {count} waiting for your approval', {
                  label: tab.label,
                  count: pendingCount,
                })
              : undefined
          }
        >
          <Icon size={16} className="shrink-0" />
          <span className="flex-1 truncate text-left">{tab.label}</span>
          {showBadge && (
            <span className="rounded-full bg-destructive px-1.5 text-[11px] font-medium leading-4 text-destructive-foreground">
              {workspaceUtils.badgeText(pendingCount)}
            </span>
          )}
        </button>
        {isActive && subTabs.length > 1 && (
          <div className="ml-4 mt-0.5 flex flex-col border-l pl-3">
            {subTabs.map((subTab) => (
              <button
                key={subTab.to}
                type="button"
                onClick={() => navigate(subTab.to)}
                className={cn(
                  'rounded-md px-2 py-1 text-left text-[13px] text-muted-foreground transition-colors',
                  'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  currentLocation === subTab.to &&
                    'font-medium text-foreground',
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

  const projectMenu: ActionMenuEntry[] = [
    {
      key: 'overview',
      label: t('Project overview'),
      icon: LayoutDashboard,
      onSelect: () =>
        navigate(authenticationSession.appendProjectRoutePrefix('/home')),
    },
    {
      key: 'share',
      label: canEdit ? t('Share') : t('View members'),
      icon: canEdit ? Share2 : Users,
      onSelect: () => setDialog('members'),
    },
    'divider',
    {
      key: 'edit',
      label: t('Edit basic info'),
      icon: Info,
      disabledReason: canEdit ? null : t('Viewers cannot change the project'),
      onSelect: () => setDialog('edit'),
    },
    {
      key: 'delete',
      label: t('Delete'),
      icon: Trash2,
      destructive: true,
      disabledReason: isOwner
        ? null
        : t('Only the project owner can delete it'),
      onSelect: () => setDialog('delete'),
    },
    'divider',
    {
      key: 'new',
      label: t('New Project'),
      icon: Plus,
      onSelect: () => setDialog('create'),
    },
    {
      key: 'copy',
      label: t('Create copy'),
      icon: CopyPlus,
      disabledReason: canEdit ? null : t('Viewers cannot copy the project'),
      onSelect: () => setDialog('copy'),
    },
    {
      key: 'all',
      label: t('All projects'),
      icon: LayoutGrid,
      onSelect: () => navigate('/projects'),
    },
  ];

  return (
    <nav className="flex h-full w-[260px] shrink-0 flex-col gap-3 overflow-y-auto border-r bg-background px-2 py-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center px-2 text-xs text-muted-foreground">
          <span className="flex-1">{t('Current project')}</span>
          <ActionMenu items={projectMenu} label={t('Project actions')} />
        </div>
        <ProjectSwitcher
          currentId={project.id}
          name={project.displayName}
          icon={project.icon}
          onCreate={() => setDialog('create')}
        />
      </div>
      <div className="flex flex-col gap-0.5">{primaryTabs.map(renderTab)}</div>
      {secondaryTabs.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t pt-3">
          {secondaryTabs.map(renderTab)}
        </div>
      )}
      <div className="flex min-h-64 flex-1 flex-col border-t pt-3">
        <WorkflowTree context={context} />
      </div>
      {dialog === 'members' && (
        <ProjectSettingsDialog
          open
          onClose={close}
          initialTab="members"
          initialValues={{ projectName: project.displayName }}
        />
      )}
      {(dialog === 'edit' || dialog === 'create') && (
        <ProjectInfoDialog
          open
          onOpenChange={(open) => !open && close()}
          project={dialog === 'edit' ? project : null}
          onCreated={(created) =>
            projectCollectionUtils.setCurrentProject(
              created.id,
              `/projects/${created.id}/home`,
            )
          }
        />
      )}
      {dialog === 'delete' && (
        <DeleteProjectDialog
          open
          onOpenChange={(open) => !open && close()}
          project={{
            id: project.id,
            displayName: project.displayName,
            runningCount: project.analytics.activeWorkflows,
          }}
        />
      )}
      {dialog === 'copy' && (
        <CopyProjectDialog
          open
          onOpenChange={(open) => !open && close()}
          project={{ id: project.id, displayName: project.displayName }}
        />
      )}
    </nav>
  );
}

function ProjectSwitcher({
  currentId,
  name,
  icon,
  onCreate,
}: {
  currentId: string;
  name: string;
  icon: ProjectIcon;
  onCreate: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const normalized = query.trim().toLowerCase();
  const mine = (directory ?? [])
    .filter((item) => projectDirectoryUtils.isMember(item))
    .filter(
      (item) =>
        normalized.length === 0 ||
        item.displayName.toLowerCase().includes(normalized),
    );
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('Switch project')}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
        >
          <ProjectMark name={name} icon={icon} className="size-8 text-sm" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {name}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="p-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t('Search project name')}
            autoFocus
          />
        </div>
        <div className="px-3 pb-1 text-xs text-muted-foreground">
          {t('My projects')}
        </div>
        <div className="flex max-h-72 flex-col overflow-y-auto px-1">
          {mine.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                'flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted',
                item.id === currentId && 'font-medium',
              )}
              onClick={() => {
                setOpen(false);
                if (item.id !== currentId) {
                  projectCollectionUtils.setCurrentProject(
                    item.id,
                    `/projects/${item.id}/home`,
                  );
                }
              }}
            >
              <ProjectMark name={item.displayName} icon={item.icon} />
              <span className="min-w-0 flex-1 truncate">
                {item.displayName}
              </span>
              {item.myRole && !projectDirectoryUtils.canEdit(item) && (
                <span className="text-xs text-muted-foreground">
                  {projectRoleLabels.label(item.myRole)}
                </span>
              )}
              {item.id === currentId && <Check className="size-4" />}
            </button>
          ))}
          {mine.length === 0 && (
            <span className="px-2 py-3 text-sm text-muted-foreground">
              {t('No matching projects')}
            </span>
          )}
        </div>
        <div className="flex gap-1 border-t p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              onCreate();
            }}
          >
            <Plus />
            {t('New Project')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              navigate('/projects');
            }}
          >
            <LayoutGrid />
            {t('All projects')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

ProjectNavColumn.displayName = 'ProjectNavColumn';

type SidebarDialog = 'members' | 'edit' | 'create' | 'delete' | 'copy';
