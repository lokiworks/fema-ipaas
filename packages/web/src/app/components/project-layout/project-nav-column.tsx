import { useLocation, useNavigate } from 'react-router-dom';

import {
  ProjectDisplay,
  getProjectName,
  projectCollectionUtils,
} from '@/features/projects';
import { cn } from '@/lib/utils';

import { pathOf, useProjectNavTabs } from './use-project-nav-tabs';

import { ProjectDashboardLayoutHeaderTab } from '.';

export function ProjectNavColumn() {
  const { primaryTabs, secondaryTabs } = useProjectNavTabs();
  const { project } = projectCollectionUtils.useCurrentProject();
  const location = useLocation();
  const navigate = useNavigate();
  const currentLocation = `${location.pathname}${location.search}`;

  const renderItem = (tab: ProjectDashboardLayoutHeaderTab) => {
    const isActive = location.pathname.includes(pathOf(tab.to));
    const subTabs = tab.children ?? [];
    const Icon = tab.icon;

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
        >
          <Icon size={16} className="shrink-0" />
          <span className="truncate">{tab.label}</span>
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

  return (
    <nav className="flex h-full w-[200px] shrink-0 flex-col gap-3 overflow-y-auto border-r bg-background px-2 py-3">
      {project && (
        <div className="px-2 pb-1">
          <ProjectDisplay
            title={getProjectName(project)}
            maxLengthToNotShowTooltip={22}
            titleClassName="text-sm font-medium"
            projectType={project.type}
          />
        </div>
      )}
      <div className="flex flex-col gap-0.5">{primaryTabs.map(renderItem)}</div>
      {secondaryTabs.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t pt-3">
          {secondaryTabs.map(renderItem)}
        </div>
      )}
    </nav>
  );
}

ProjectNavColumn.displayName = 'ProjectNavColumn';
