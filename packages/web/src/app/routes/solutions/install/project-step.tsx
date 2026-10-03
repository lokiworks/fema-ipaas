import { SolutionPackage } from '@fema-ipaas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getProjectName,
  NewProjectDialog,
  projectCollectionUtils,
} from '@/features/projects';
import {
  PROJECT_DIRECTORY_QUERY_KEY,
  projectDirectoryHooks,
  projectDirectoryUtils,
} from '@/features/projects/api/project-directory-api';

import { WizardFooter } from './wizard-parts';

function ProjectStep({ pkg, projectId, onNext }: ProjectStepProps) {
  const { data: projects } = projectCollectionUtils.useAll();
  const { data: directory, isLoading } = projectDirectoryHooks.useDirectory();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState(projectId);
  const editableIds = new Set(
    (directory ?? [])
      .filter(projectDirectoryUtils.canEdit)
      .map((project) => project.id),
  );
  const choices = projects.filter((project) => editableIds.has(project.id));
  const selected = choices.some((project) => project.id === picked)
    ? picked
    : '';

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>{t('Install into project')}</Label>
        <Select value={selected} onValueChange={setPicked}>
          <SelectTrigger>
            <SelectValue placeholder={t('Select a project')} />
          </SelectTrigger>
          <SelectContent>
            {choices.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {getProjectName(project)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-3">
          <p className="grow text-xs text-muted-foreground">
            {t('Only projects you can edit are listed')}
          </p>
          <NewProjectDialog
            onCreate={(created) => {
              void queryClient
                .invalidateQueries({ queryKey: PROJECT_DIRECTORY_QUERY_KEY })
                .then(() => setPicked(created.id));
            }}
          >
            <Button type="button" variant="outline" size="sm">
              <Plus className="size-4" />
              {t('New project')}
            </Button>
          </NewProjectDialog>
        </div>
        {!isLoading && choices.length === 0 && (
          <Alert variant="warning">
            <AlertDescription>
              {t(
                'You cannot edit any project yet. Ask a project admin for edit access, or create a project of your own.',
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">
          {t('After installing, the project gets')}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {t('{count, plural, =1 {1 workflow} other {# workflows}}', {
              count: pkg.workflows.length,
            })}
          </Badge>
          {pkg.mappingTables.length > 0 && (
            <Badge variant="secondary">
              {t(
                '{count, plural, =1 {1 mapping table} other {# mapping tables}}',
                {
                  count: pkg.mappingTables.length,
                },
              )}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('Workflows are created disabled. Test them before enabling.')}
        </p>
      </div>
      <WizardFooter
        nextDisabled={isLoading || selected.length === 0}
        onNext={() => onNext(selected)}
      />
    </div>
  );
}

export { ProjectStep };

type ProjectStepProps = {
  pkg: SolutionPackage;
  projectId: string;
  onNext: (projectId: string) => void;
};
