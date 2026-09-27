import {
  PROJECT_COLOR_PALETTE,
  ProjectDirectoryItem,
  ProjectWithLimits,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Plus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { NewProjectDialog } from '@/features/projects';

import { homeUtils } from '../utils/home-utils';

import { HomeSection } from './home-section';

export function HomeProjects({
  projects,
  onProjectCreated,
}: {
  projects: ProjectDirectoryItem[];
  onProjectCreated: (project: ProjectWithLimits) => void;
}) {
  return (
    <HomeSection
      title={t('My projects')}
      tourTarget="home-projects"
      action={
        <Link to="/projects" className="text-xs text-primary hover:underline">
          {t('All projects')}
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
        <NewProjectDialog onCreate={onProjectCreated}>
          <button
            type="button"
            className="flex min-h-32 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground hover:border-primary hover:text-primary"
          >
            <Plus className="size-4" />
            {t('New project')}
          </button>
        </NewProjectDialog>
      </div>
    </HomeSection>
  );
}

function ProjectCard({ project }: { project: ProjectDirectoryItem }) {
  const palette = PROJECT_COLOR_PALETTE[project.icon.color];
  return (
    <Link
      to={`/projects/${project.id}`}
      className="flex flex-col gap-2.5 rounded-xl border bg-background p-3.5 hover:border-foreground/30"
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold"
          style={{ backgroundColor: palette.color, color: palette.textColor }}
        >
          {project.displayName.charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col">
          <TextWithTooltip tooltipMessage={project.displayName}>
            <div className="truncate text-sm font-medium">
              {project.displayName}
            </div>
          </TextWithTooltip>
          <span className="text-xs text-muted-foreground">
            {t(homeUtils.roleLabelKey(project.myRole))}
          </span>
        </div>
      </div>
      <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
        {project.description || t('No description')}
      </p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          {t('homeWorkflowCount', {
            count: project.workflowCount,
          })}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-success" />
          {t('{count} running', { count: project.runningCount })}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Users className="size-3.5" />
          {project.memberCount}
        </span>
      </div>
    </Link>
  );
}
