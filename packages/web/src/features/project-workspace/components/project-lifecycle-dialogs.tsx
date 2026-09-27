import { PROJECT_NAME_MAX_LENGTH } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { projectDirectoryHooks } from '@/features/projects/api/project-directory-api';
import { projectCollectionUtils } from '@/features/projects/stores/project-collection';

import { projectWorkspaceHooks } from '../hooks/project-workspace-hooks';
import { workspaceUtils } from '../lib/workspace-utils';

import { TypeToConfirmDialog } from './type-to-confirm-dialog';

export function DeleteProjectDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: { id: string; displayName: string; runningCount: number };
}) {
  const navigate = useNavigate();
  const { data: counts } = projectWorkspaceHooks.useResourceCounts({
    projectId: project.id,
    enabled: open,
  });
  const { mutate: remove, isPending } = projectWorkspaceHooks.useDeleteProject();
  const blockedReason =
    project.runningCount > 0
      ? t(
          'Stop the {count} running workflows in this project before deleting it.',
          { count: project.runningCount },
        )
      : null;
  const description = counts
    ? t(
        'The project and its {workflows} workflows (with published versions, promotion records and run logs), {folders} folders, environment settings, {variables} project configs, {mappingTables} mapping tables, {dataStores} data stores and all {members} memberships will be deleted. This cannot be undone.',
        {
          workflows: counts.workflows,
          folders: counts.folders,
          variables: counts.variables,
          mappingTables: counts.mappingTables,
          dataStores: counts.dataStores,
          members: counts.members,
        },
      )
    : t('Loading...');
  return (
    <TypeToConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Delete project {name}?', { name: project.displayName })}
      description={description}
      confirmText={project.displayName}
      actionLabel={t('Delete project')}
      isPending={isPending}
      blockedReason={blockedReason}
      onConfirm={() =>
        remove(project.id, {
          onSuccess: () => {
            toast.success(
              t('Deleted project {name}', { name: project.displayName }),
            );
            onOpenChange(false);
            navigate('/projects');
          },
        })
      }
    />
  );
}

export function CopyProjectDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: { id: string; displayName: string };
}) {
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const { mutate: copy, isPending } = projectWorkspaceHooks.useCopyProject();
  const displayName = workspaceUtils.uniqueName({
    base: t('{name} copy', { name: project.displayName }),
    taken: (directory ?? []).map((item) => item.displayName),
    maxLength: PROJECT_NAME_MAX_LENGTH,
  });
  const handleCopy = () =>
    copy(
      { projectId: project.id, request: { displayName } },
      {
        onSuccess: (result) => {
          toast.success(
            t(
              'Created {name}: {workflows} workflows, {folders} folders, {variables} project configs, {mappingTables} mapping tables, {dataStores} data stores',
              {
                name: result.displayName,
                workflows: result.copied.workflows,
                folders: result.copied.folders,
                variables: result.copied.variables,
                mappingTables: result.copied.mappingTables,
                dataStores: result.copied.dataStores,
              },
            ),
            {
              description:
                result.clearedConnections > 0
                  ? t(
                      '{count} steps need their connection selected again',
                      { count: result.clearedConnections },
                    )
                  : undefined,
            },
          );
          onOpenChange(false);
          projectCollectionUtils.setCurrentProject(
            result.projectId,
            `/projects/${result.projectId}/home`,
          );
        },
      },
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('Create a copy of {name}?', { name: project.displayName })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Folders, environment settings, project configs, mapping tables, data stores (structure only, no records) and all workflows are copied. Workflows become unpublished drafts and connections that are not available to the new project are cleared. Members, published versions, promotion records and run logs are not copied.',
            )}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          {t('The copy will be named {name}', { name: displayName })}
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="button" loading={isPending} onClick={handleCopy}>
            {t('Create copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
