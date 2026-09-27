import { isNil } from '@fema-ipaas/core-utils';
import {
  ProjectDirectoryItem,
  ProjectType,
  Template,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { projectDirectoryUtils } from '@/features/projects/api/project-directory-api';
import { ProjectDisplay } from '@/features/projects/components/project-display';

import { DisabledReason } from './disabled-reason';

export function TemplateTargetProjectDialog({
  open,
  onOpenChange,
  template,
  directory,
  isLoading,
  isError,
  defaultProjectId,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template;
  directory: ProjectDirectoryItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  defaultProjectId: string | null;
  onConfirm: (projectId: string) => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Select target project')}</DialogTitle>
          <DialogDescription>
            {t('Create a workflow from the template "{name}"', {
              name: template.name,
            })}
          </DialogDescription>
        </DialogHeader>
        {isLoading || isNil(directory) ? (
          <TargetProjectPlaceholder isError={isError} />
        ) : (
          <TargetProjectSelection
            key={open ? 'open' : 'closed'}
            directory={directory}
            defaultProjectId={defaultProjectId}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
            isPending={isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TargetProjectPlaceholder({ isError }: { isError: boolean }) {
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {t('Could not load your projects. Try again later.')}
        </AlertDescription>
      </Alert>
    );
  }
  return <Skeleton className="h-9 w-full" />;
}

function TargetProjectSelection({
  directory,
  defaultProjectId,
  onCancel,
  onConfirm,
  isPending,
}: {
  directory: ProjectDirectoryItem[];
  defaultProjectId: string | null;
  onCancel: () => void;
  onConfirm: (projectId: string) => void;
  isPending: boolean;
}) {
  const editable = directory.filter(projectDirectoryUtils.canEdit);
  const eligible = editable.filter(projectDirectoryUtils.canCreateWorkflow);
  const [projectId, setProjectId] = useState<string | null>(
    () =>
      eligible.find((project) => project.id === defaultProjectId)?.id ??
      eligible[0]?.id ??
      null,
  );

  return (
    <>
      {editable.length === 0 ? (
        <Alert variant="warning">
          <AlertDescription>
            {t(
              'You have no project you can edit yet. Create a project first, then create a workflow from the template.',
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="template-target-project" showRequiredIndicator>
            {t('Target project')}
          </Label>
          <Select value={projectId ?? undefined} onValueChange={setProjectId}>
            <SelectTrigger id="template-target-project">
              <SelectValue placeholder={t('Select a project')} />
            </SelectTrigger>
            <SelectContent>
              {editable.map((project) => {
                const full = projectDirectoryUtils.isFull(project);
                return (
                  <SelectItem
                    key={project.id}
                    value={project.id}
                    disabled={full}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <ProjectDisplay
                        title={project.displayName}
                        icon={project.icon}
                        projectType={ProjectType.TEAM}
                      />
                      {full && (
                        <span className="text-xs text-muted-foreground">
                          {t('Workflow limit reached')}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('Only projects you can edit are listed')}
          </p>
        </div>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          {t('Cancel')}
        </Button>
        <DisabledReason
          reason={isNil(projectId) ? t('Select a project first') : null}
        >
          <Button
            type="button"
            loading={isPending}
            disabled={isNil(projectId)}
            onClick={() => {
              if (!isNil(projectId)) {
                onConfirm(projectId);
              }
            }}
          >
            {t('Confirm')}
          </Button>
        </DisabledReason>
      </DialogFooter>
    </>
  );
}
