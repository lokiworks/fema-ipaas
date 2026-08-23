import { Permission } from '@fema/core-utils';
import {
  WorkflowOperationType,
  WorkflowVersion,
  PopulatedWorkflow,
} from '@fema/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  Copy,
  CornerUpLeft,
  Download,
  GalleryVerticalEnd,
  Import,
  Pencil,
  Share2,
  Trash2,
  User,
} from 'lucide-react';
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { PermissionNeededTooltip } from '@/components/custom/permission-needed-tooltip';
import { LoadingSpinner } from '@/components/custom/spinner';
import { useEmbedding } from '@/components/providers/embed-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoveToFolderDialog } from '@/features/automations/components/move-to-folder-dialog';
import { RenameDialog } from '@/features/automations/components/rename-dialog';
import { foldersHooks } from '@/features/folders';
import { workflowHooks, workflowsApi } from '@/features/workflows';
import { ChangeOwnerDialog } from '@/features/workflows/components/change-owner-dialog';
import { ImportWorkflowDialog } from '@/features/workflows/components/import-workflow-dialog';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { useNewWindow } from '@/lib/navigation-utils';

import { ShareTemplateDialog } from '../../features/workflows/components/share-template-dialog';

type WorkflowActionMenuProps = {
  workflow: PopulatedWorkflow;
  workflowVersion: WorkflowVersion;
  children?: React.ReactNode;
  readonly: boolean;
  onRename: () => void;
  onMoveTo: (folderId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOwnerChange?: () => void;
} & (
  | { insideBuilder: true; onVersionsListClick: () => void }
  | { insideBuilder: false; onVersionsListClick: null }
);

const WorkflowActionMenu: React.FC<WorkflowActionMenuProps> = ({
  workflow,
  workflowVersion,
  children,
  readonly,
  onRename,
  onMoveTo,
  onDuplicate,
  onDelete,
  onOwnerChange,
  onVersionsListClick,
  insideBuilder,
}) => {
  const isRunsPage = useLocation().pathname.includes('/runs');
  const openNewWindow = useNewWindow();
  const { checkAccess } = useAuthorization();
  const userHasPermissionToWriteFolder = checkAccess(Permission.WRITE_FOLDER);
  const userHasPermissionToUpdateWorkflow = checkAccess(
    Permission.WRITE_WORKFLOW,
  );

  const { embedState } = useEmbedding();
  const isDevelopmentBranch = false;
  const [open, setOpen] = useState(false);
  const hasWorkspaceMembers = false;

  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(workflowVersion.displayName);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [folderToMoveId, setFolderToMoveId] = useState('');
  const { folders } = foldersHooks.useFolders();

  const { mutate: renameWorkflow, isPending: isRenamePending } = useMutation({
    mutationFn: async () =>
      workflowsApi.update(workflow.id, {
        type: WorkflowOperationType.CHANGE_NAME,
        request: { displayName: renameValue },
      }),
    onSuccess: () => {
      setIsRenameOpen(false);
      onRename();
      toast.success(t('Workflow has been renamed.'));
    },
  });

  const { mutate: moveWorkflow, isPending: isMovePending } = useMutation({
    mutationFn: async () =>
      workflowsApi.update(workflow.id, {
        type: WorkflowOperationType.CHANGE_FOLDER,
        request: { folderId: folderToMoveId },
      }),
    onSuccess: () => {
      setIsMoveOpen(false);
      onMoveTo(folderToMoveId);
      toast.success(t('Moved workflow successfully'));
    },
  });

  const { mutate: duplicateWorkflow, isPending: isDuplicatePending } =
    useMutation({
      mutationFn: async () => {
        const modifiedWorkflowVersion = {
          ...workflowVersion,
          displayName: `${workflowVersion.displayName} - Copy`,
        };
        const createdWorkflow = await workflowsApi.create({
          displayName: modifiedWorkflowVersion.displayName,
          workspaceId: authenticationSession.getWorkspaceId()!,
          folderId: workflow.folderId ?? undefined,
        });
        const updatedWorkflow = await workflowsApi.update(createdWorkflow.id, {
          type: WorkflowOperationType.IMPORT_WORKFLOW,
          request: {
            displayName: modifiedWorkflowVersion.displayName,
            trigger: modifiedWorkflowVersion.trigger,
            schemaVersion: modifiedWorkflowVersion.schemaVersion,
            notes: modifiedWorkflowVersion.notes,
          },
        });
        return updatedWorkflow;
      },
      onSuccess: (data) => {
        openNewWindow(`/workflows/${data.id}`);
        onDuplicate();
      },
    });

  const { mutate: exportWorkflow, isPending: isExportPending } =
    workflowHooks.useExportWorkflows();
  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent
          noAnimationOnOut={true}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {!readonly && (
            <>
              {insideBuilder && (
                <PermissionNeededTooltip
                  hasPermission={userHasPermissionToUpdateWorkflow}
                >
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOpen(false);
                      onRename();
                    }}
                    disabled={!userHasPermissionToUpdateWorkflow}
                  >
                    <div className="flex cursor-pointer flex-row gap-2 items-center">
                      <Pencil className="h-4 w-4" />
                      <span>{t('Rename')}</span>
                    </div>
                  </DropdownMenuItem>
                </PermissionNeededTooltip>
              )}

              {!insideBuilder && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    setRenameValue(workflowVersion.displayName);
                    setIsRenameOpen(true);
                  }}
                  disabled={!userHasPermissionToUpdateWorkflow}
                >
                  <div className="flex cursor-pointer flex-row gap-2 items-center">
                    <Pencil className="h-4 w-4" />
                    <span>{t('Rename')}</span>
                  </div>
                </DropdownMenuItem>
              )}
            </>
          )}

          {!embedState.hideFolders && (
            <PermissionNeededTooltip
              hasPermission={
                userHasPermissionToUpdateWorkflow ||
                userHasPermissionToWriteFolder
              }
            >
              <DropdownMenuItem
                disabled={
                  !userHasPermissionToUpdateWorkflow ||
                  !userHasPermissionToWriteFolder
                }
                onSelect={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  setIsMoveOpen(true);
                }}
              >
                <div className="flex cursor-pointer  flex-row gap-2 items-center">
                  <CornerUpLeft className="h-4 w-4" />
                  <span>{t('Move To')}</span>
                </div>
              </DropdownMenuItem>
            </PermissionNeededTooltip>
          )}
          {!readonly && hasWorkspaceMembers && !embedState.isEmbedded && (
            <PermissionNeededTooltip
              hasPermission={userHasPermissionToUpdateWorkflow}
            >
              <ChangeOwnerDialog
                workflow={workflow}
                onOwnerChange={onOwnerChange || (() => {})}
              >
                <DropdownMenuItem
                  disabled={!userHasPermissionToUpdateWorkflow}
                  onSelect={(e) => e.preventDefault()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex cursor-pointer  flex-row gap-2 items-center">
                    <User className="h-4 w-4" />
                    <span>{t('Change Owner')}</span>
                  </div>
                </DropdownMenuItem>
              </ChangeOwnerDialog>
            </PermissionNeededTooltip>
          )}
          {!embedState.hideDuplicateWorkflow && (
            <PermissionNeededTooltip
              hasPermission={userHasPermissionToUpdateWorkflow}
            >
              <DropdownMenuItem
                disabled={!userHasPermissionToUpdateWorkflow}
                onClick={() => duplicateWorkflow()}
              >
                <div className="flex cursor-pointer  flex-row gap-2 items-center">
                  {isDuplicatePending ? (
                    <LoadingSpinner />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span>
                    {isDuplicatePending ? t('Duplicating') : t('Duplicate')}
                  </span>
                </div>
              </DropdownMenuItem>
            </PermissionNeededTooltip>
          )}

          {insideBuilder && !isRunsPage && (
            <DropdownMenuItem onClick={onVersionsListClick}>
              <div className="flex cursor-pointer  flex-row gap-2 items-center">
                <GalleryVerticalEnd className="h-4 w-4" />
                <span>{t('Versions')}</span>
              </div>
            </DropdownMenuItem>
          )}
          {!readonly &&
            insideBuilder &&
            !embedState.hideExportAndImportWorkflow && (
              <PermissionNeededTooltip
                hasPermission={userHasPermissionToUpdateWorkflow}
              >
                <ImportWorkflowDialog
                  insideBuilder={true}
                  workflowId={workflow.id}
                >
                  <DropdownMenuItem
                    disabled={!userHasPermissionToUpdateWorkflow}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <div className="flex cursor-pointer flex-row gap-2 items-center">
                      <Import className="w-4 h-4" />
                      {t('Import')}
                    </div>
                  </DropdownMenuItem>
                </ImportWorkflowDialog>
              </PermissionNeededTooltip>
            )}

          {!embedState.hideExportAndImportWorkflow && (
            <DropdownMenuItem onClick={() => exportWorkflow([workflow])}>
              <div className="flex cursor-pointer  flex-row gap-2 items-center">
                {isExportPending ? (
                  <LoadingSpinner />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>{isExportPending ? t('Exporting') : t('Export')}</span>
              </div>
            </DropdownMenuItem>
          )}
          {!embedState.isEmbedded && (
            <ShareTemplateDialog
              workflowId={workflow.id}
              workflowVersionId={workflowVersion.id}
            >
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <div className="flex cursor-pointer  flex-row gap-2 items-center">
                  <Share2 className="h-4 w-4" />
                  <span>{t('Share')}</span>
                </div>
              </DropdownMenuItem>
            </ShareTemplateDialog>
          )}
          {!readonly &&
            (!embedState.isEmbedded ||
              !embedState.disableNavigationInBuilder ||
              !insideBuilder) && (
              <PermissionNeededTooltip
                hasPermission={userHasPermissionToUpdateWorkflow}
              >
                <ConfirmationDeleteDialog
                  title={t('Delete Workflow')}
                  message={
                    <>
                      <div>
                        {t(
                          'This will permanently delete the workflow, all its data, and any background runs.',
                        )}
                      </div>
                      {isDevelopmentBranch && (
                        <div className="font-bold mt-2">
                          {t(
                            'You are on a development branch, this will also delete the workflow from the remote repository.',
                          )}
                        </div>
                      )}
                    </>
                  }
                  mutationFn={async () => {
                    await workflowsApi.delete(workflow.id);
                    onDelete();
                  }}
                  entityName={t('workflow')}
                  buttonText={t('Delete')}
                >
                  <DropdownMenuItem
                    disabled={!userHasPermissionToUpdateWorkflow}
                    onSelect={(e) => e.preventDefault()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex cursor-pointer  flex-row gap-2 items-center">
                      <Trash2 className="h-4 w-4 text-destructive" />
                      <span className="text-destructive">{t('Delete')}</span>
                    </div>
                  </DropdownMenuItem>
                </ConfirmationDeleteDialog>
              </PermissionNeededTooltip>
            )}
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameDialog
        open={isRenameOpen}
        onOpenChange={setIsRenameOpen}
        value={renameValue}
        onChange={setRenameValue}
        onConfirm={() => renameWorkflow()}
        isRenaming={isRenamePending}
      />
      <MoveToFolderDialog
        open={isMoveOpen}
        onOpenChange={setIsMoveOpen}
        folders={folders}
        selectedFolderId={folderToMoveId}
        onFolderChange={setFolderToMoveId}
        onConfirm={() => moveWorkflow()}
        isMoving={isMovePending}
      />
    </>
  );
};

export default WorkflowActionMenu;
