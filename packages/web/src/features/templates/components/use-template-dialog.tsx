import { isNil } from '@fema/core-utils';
import {
  PopulatedWorkflow,
  Template,
  TemplateTelemetryEventType,
  TemplateType,
  UncategorizedFolderId,
} from '@fema/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { useState, useEffect } from 'react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { foldersApi, foldersHooks } from '@/features/folders';
import { templatesTelemetryApi } from '@/features/templates';
import { workflowHooks } from '@/features/workflows';
import {
  getWorkspaceName,
  workspaceCollectionUtils,
} from '@/features/workspaces';
import { ApWorkspaceDisplay } from '@/features/workspaces/components/ap-workspace-display';
import { authenticationSession } from '@/lib/authentication-session';

type UseTemplateDialogProps = {
  template: Template;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const UseTemplateDialog = ({
  template,
  open,
  onOpenChange,
}: UseTemplateDialogProps) => {
  const navigate = useNavigate();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');

  const { data: workspaces } = workspaceCollectionUtils.useAll();
  const { folders } = foldersHooks.useFolders();

  useEffect(() => {
    if (open) {
      const currentWorkspaceId = authenticationSession.getWorkspaceId();
      if (currentWorkspaceId) {
        setSelectedWorkspaceId(currentWorkspaceId);
      } else if (workspaces && workspaces.length > 0) {
        setSelectedWorkspaceId(workspaces[0].id);
      }
      setSelectedFolderId(UncategorizedFolderId);
    }
  }, [open, workspaces]);

  const { mutate: createWorkflow, isPending } = useMutation<
    PopulatedWorkflow[],
    Error,
    { workspaceId: string; folderId: string }
  >({
    mutationFn: async ({ workspaceId, folderId }) => {
      const workflows = template.workflows || [];
      const hasMultipleWorkflows = workflows.length > 1;

      let folderName: string | undefined;

      if (hasMultipleWorkflows) {
        const newFolder = await foldersApi.create({
          displayName: template.name,
          workspaceId: workspaceId,
        });
        folderName = newFolder.displayName;
      } else if (!isNil(folderId) && folderId !== UncategorizedFolderId) {
        const folder = await foldersApi.get(folderId);
        folderName = folder.displayName;
      }

      return await workflowHooks.importWorkflowsFromTemplates({
        templates: [template],
        workspaceId,
        folderName,
      });
    },
    onSuccess: (workflows) => {
      onOpenChange(false);
      if (workflows.length === 1) {
        toast.success(t('Workflow created successfully'));
        navigate(`/workflows/${workflows[0].id}`);
      } else {
        toast.success(
          t('{count} workflows created successfully in a new folder', {
            count: workflows.length,
          }),
        );
        navigate(`/workflows`);
      }
    },
    onError: (error) => {
      toast.error(t('Failed to create workflow from template'));
      console.error('Error creating workflow:', error);
    },
  });

  const handleConfirmUseTemplate = () => {
    if (!selectedWorkspaceId) {
      toast.error(t('Please select a workspace'));
      return;
    }
    createWorkflow({
      workspaceId: selectedWorkspaceId,
      folderId: selectedFolderId,
    });

    const userId = authenticationSession.getCurrentUserId();

    if (template.type === TemplateType.OFFICIAL && userId) {
      templatesTelemetryApi.sendEvent({
        eventType: TemplateTelemetryEventType.INSTALL,
        templateId: template.id,
        userId,
      });
    }
  };

  const workflowCount = template.workflows?.length || 0;
  const hasMultipleWorkflows = workflowCount > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Use Template')}</DialogTitle>
          <DialogDescription>
            {hasMultipleWorkflows
              ? t(
                  'This template includes {count} workflows with all dependencies. A new folder will be created to organize them.',
                  { count: workflowCount },
                )
              : t(
                  'Select the workspace and folder where you want to use this template.',
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="workspace">{t('Workspace')}</Label>
            <Select
              value={selectedWorkspaceId}
              onValueChange={setSelectedWorkspaceId}
            >
              <SelectTrigger id="workspace">
                <SelectValue placeholder={t('Select a workspace')} />
              </SelectTrigger>
              <SelectContent>
                {workspaces?.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    <ApWorkspaceDisplay
                      title={getWorkspaceName(workspace)}
                      icon={workspace.icon}
                      workspaceType={workspace.type}
                    />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!hasMultipleWorkflows && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="folder">{t('Folder')}</Label>
              <Select
                value={selectedFolderId}
                onValueChange={setSelectedFolderId}
              >
                <SelectTrigger id="folder">
                  <SelectValue placeholder={t('Select a folder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UncategorizedFolderId}>
                    {t('Uncategorized')}
                  </SelectItem>
                  {folders?.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleConfirmUseTemplate}
            loading={isPending}
            disabled={!selectedWorkspaceId}
          >
            {t('Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
