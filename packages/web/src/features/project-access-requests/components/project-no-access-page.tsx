import { t } from 'i18next';
import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  projectDirectoryHooks,
  projectDirectoryUtils,
} from '@/features/projects/api/project-directory-api';

import { RequestProjectAccessButton } from './request-project-access-button';

export function ProjectNoAccessPage({ projectId }: { projectId: string }) {
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const project = directory?.find((item) => item.id === projectId);
  const canRequest =
    project !== undefined && !projectDirectoryUtils.isMember(project);
  return (
    <div className="flex w-full justify-start bg-background p-6 lg:p-12">
      <div className="flex max-w-lg flex-col items-start gap-4 rounded-lg border p-6">
        <Lock className="size-8 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">
            {t('You are not a member of this project')}
          </h1>
          {project && (
            <span className="text-sm text-muted-foreground">
              {project.ownerName
                ? t('projectNoAccessProjectWithOwner', {
                    project: project.displayName,
                    owner: project.ownerName,
                  })
                : project.displayName}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {canRequest
            ? t('projectNoAccessRequestHint')
            : t(
                'Ask the project owner or an administrator to add you, or go back to the home page.',
              )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canRequest && (
            <RequestProjectAccessButton
              projectId={project.id}
              projectName={project.displayName}
            />
          )}
          <Button asChild variant={canRequest ? 'outline' : 'default'}>
            <Link to="/">{t('Go to home')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
