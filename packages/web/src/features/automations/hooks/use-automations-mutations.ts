import { isNil } from '@fema/core-utils';
import {
  WorkflowOperationType,
  PopulatedWorkflow,
  UncategorizedFolderId,
} from '@fema/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { foldersApi } from '@/features/folders/api/folders-api';
import { workflowsApi } from '@/features/workflows/api/workflows-api';
import { workflowHooks } from '@/features/workflows/hooks/workflow-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { useNewWindow } from '@/lib/navigation-utils';
import { NEW_WORKFLOW_QUERY_PARAM } from '@/lib/route-utils';

import { SelectedItemsMap, TreeItem } from '../lib/types';

import { getSelectedIdsByType } from './use-automations-selection';

type MutationDeps = {
  invalidateAll: () => void;
  invalidateRoot: () => void;
  invalidateFolder: (folderId: string) => void;
  clearSelection: () => void;
  treeItems: TreeItem[];
  unpinItem?: (itemId: string) => void;
};

export function useAutomationsMutations(deps: MutationDeps) {
  const openNewWindow = useNewWindow();
  const navigate = useNavigate();
  const workspaceId = authenticationSession.getWorkspaceId() ?? '';

  const { mutate: startFromScratch, isPending: isCreateWorkflowPending } =
    useMutation<PopulatedWorkflow, Error, string | undefined>({
      mutationFn: async (folderId) => {
        return workflowsApi.create({
          workspaceId,
          displayName: t('Untitled'),
          folderId:
            !folderId || folderId === UncategorizedFolderId
              ? undefined
              : folderId,
        });
      },
      onSuccess: (workflow) => {
        navigate(`/workflows/${workflow.id}?${NEW_WORKFLOW_QUERY_PARAM}=true`);
      },
    });

  const { mutate: exportWorkflows, isPending: isExportWorkflowsPending } =
    workflowHooks.useExportWorkflows();

  const { mutateAsync: deleteItem } = useMutation({
    mutationFn: async (item: TreeItem) => {
      switch (item.type) {
        case 'workflow':
          await workflowsApi.delete(item.id);
          break;
        case 'folder':
          await foldersApi.delete(item.id);
          break;
      }
    },
    onSuccess: () => {
      deps.invalidateAll();
      toast.success(t('Item deleted successfully'));
    },
    onError: () => toast.error(t('Failed to delete item')),
  });

  const { mutateAsync: bulkDelete, isPending: isDeleting } = useMutation({
    mutationFn: async (selectedItems: SelectedItemsMap) => {
      const { workflowIds, folderIds } = getSelectedIdsByType(selectedItems);
      await Promise.all([
        ...workflowIds.map((id) => workflowsApi.delete(id)),
        ...folderIds.map((id) => foldersApi.delete(id)),
      ]);
    },
    onSuccess: () => {
      deps.clearSelection();
      deps.invalidateAll();
      toast.success(t('Items deleted successfully'));
    },
    onError: () => toast.error(t('Failed to delete items')),
  });

  const { mutateAsync: bulkMoveTo, isPending: isBulkMoving } = useMutation({
    mutationFn: async ({
      selectedItems,
      targetFolderId,
    }: {
      selectedItems: SelectedItemsMap;
      targetFolderId: string;
    }) => {
      const { workflowIds } = getSelectedIdsByType(selectedItems);
      const folderId =
        isNil(targetFolderId) || targetFolderId === UncategorizedFolderId
          ? null
          : targetFolderId;
      await Promise.all(
        workflowIds.map((id) =>
          workflowsApi.update(id, {
            type: WorkflowOperationType.CHANGE_FOLDER,
            request: { folderId },
          }),
        ),
      );
    },
    onSuccess: (_data, { selectedItems, targetFolderId }) => {
      if (targetFolderId && targetFolderId !== UncategorizedFolderId) {
        for (const [id] of selectedItems) {
          deps.unpinItem?.(id);
        }
      }
      deps.clearSelection();
      deps.invalidateAll();
      toast.success(t('Items moved successfully'));
    },
    onError: () => toast.error(t('Failed to move items')),
  });

  const { mutateAsync: rename, isPending: isRenaming } = useMutation({
    mutationFn: async ({
      item,
      newName,
    }: {
      item: TreeItem;
      newName: string;
    }) => {
      if (item.type === 'workflow') {
        await workflowsApi.update(item.id, {
          type: WorkflowOperationType.CHANGE_NAME,
          request: { displayName: newName },
        });
      } else if (item.type === 'folder') {
        await foldersApi.renameFolder(item.id, { displayName: newName });
      }
    },
    onSuccess: () => {
      deps.invalidateAll();
      toast.success(t('Renamed successfully'));
    },
    onError: () => toast.error(t('Failed to rename item')),
  });

  const { mutate: duplicateWorkflow, isPending: isDuplicating } = useMutation({
    mutationFn: async (workflow: PopulatedWorkflow) => {
      const version = workflow.version;
      const displayName = `${version.displayName} - Copy`;
      const createdWorkflow = await workflowsApi.create({
        displayName,
        workspaceId: workflow.workspaceId,
        folderId: workflow.folderId ?? undefined,
      });
      return workflowsApi.update(createdWorkflow.id, {
        type: WorkflowOperationType.IMPORT_WORKFLOW,
        request: {
          displayName,
          trigger: version.trigger,
          schemaVersion: version.schemaVersion,
          notes: version.notes,
        },
      });
    },
    onSuccess: (data) => {
      openNewWindow(`/workflows/${data.id}`);
      deps.invalidateAll();
      toast.success(t('Workflow duplicated successfully'));
    },
    onError: () => toast.error(t('Failed to duplicate workflow')),
  });

  const { mutate: moveItem, isPending: isMovingItem } = useMutation({
    mutationFn: async ({
      item,
      targetFolderId,
    }: {
      item: TreeItem;
      targetFolderId: string;
    }) => {
      const folderId =
        isNil(targetFolderId) || targetFolderId === UncategorizedFolderId
          ? null
          : targetFolderId;
      if (item.type === 'workflow') {
        await workflowsApi.update(item.id, {
          type: WorkflowOperationType.CHANGE_FOLDER,
          request: { folderId },
        });
      }
    },
    onSuccess: (_data, { item, targetFolderId }) => {
      if (targetFolderId && targetFolderId !== UncategorizedFolderId) {
        deps.unpinItem?.(item.id);
      }
      deps.invalidateAll();
      toast.success(t('Moved successfully'));
    },
    onError: () => toast.error(t('Failed to move item')),
  });

  const handleBulkExport = useCallback(
    (selectedItems: SelectedItemsMap) => {
      const { workflowIds } = getSelectedIdsByType(selectedItems);

      if (workflowIds.length > 0) {
        const workflowsById = new Map(
          deps.treeItems
            .filter(isWorkflowTreeItem)
            .map((item) => [item.id, item.data]),
        );
        const workflowsToExport = workflowIds
          .map((id) => workflowsById.get(id))
          .filter(
            (workflow): workflow is PopulatedWorkflow => !isNil(workflow),
          );
        if (workflowsToExport.length > 0) {
          exportWorkflows(workflowsToExport);
        }
      }

      deps.clearSelection();
    },
    [deps, exportWorkflows],
  );

  const handleExportWorkflow = useCallback(
    (workflow: PopulatedWorkflow) => {
      exportWorkflows([workflow]);
    },
    [exportWorkflows],
  );

  return {
    createWorkflow: (folderId?: string) => startFromScratch(folderId),
    isCreateWorkflowPending,
    handleDeleteItem: deleteItem,
    handleBulkDelete: bulkDelete,
    handleBulkMoveTo: (
      selectedItems: SelectedItemsMap,
      targetFolderId: string,
    ) => bulkMoveTo({ selectedItems, targetFolderId }),
    handleBulkExport,
    handleRename: (item: TreeItem, newName: string) =>
      rename({ item, newName }),
    handleDuplicateWorkflow: duplicateWorkflow,
    handleMoveItem: (item: TreeItem, targetFolderId: string) =>
      moveItem({ item, targetFolderId }),
    handleExportWorkflow,
    isDeleting,
    isMoving: isBulkMoving || isMovingItem,
    isRenaming,
    isDuplicating,
    isExporting: isExportWorkflowsPending,
  };
}

function isWorkflowTreeItem(
  item: TreeItem,
): item is TreeItem & { data: PopulatedWorkflow } {
  return item.type === 'workflow' && !isNil(item.data);
}
