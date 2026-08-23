import { isNil } from '@fema/core-utils';
import {
  FlowOperationType,
  PopulatedFlow,
  UncategorizedFolderId,
} from '@fema/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { flowsApi } from '@/features/flows/api/flows-api';
import { flowHooks } from '@/features/flows/hooks/flow-hooks';
import { foldersApi } from '@/features/folders/api/folders-api';
import { authenticationSession } from '@/lib/authentication-session';
import { useNewWindow } from '@/lib/navigation-utils';
import { NEW_FLOW_QUERY_PARAM } from '@/lib/route-utils';

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

  const { mutate: startFromScratch, isPending: isCreateFlowPending } =
    useMutation<PopulatedFlow, Error, string | undefined>({
      mutationFn: async (folderId) => {
        return flowsApi.create({
          workspaceId,
          displayName: t('Untitled'),
          folderId:
            !folderId || folderId === UncategorizedFolderId
              ? undefined
              : folderId,
        });
      },
      onSuccess: (flow) => {
        navigate(`/flows/${flow.id}?${NEW_FLOW_QUERY_PARAM}=true`);
      },
    });

  const { mutate: exportFlows, isPending: isExportFlowsPending } =
    flowHooks.useExportFlows();

  const { mutateAsync: deleteItem } = useMutation({
    mutationFn: async (item: TreeItem) => {
      switch (item.type) {
        case 'flow':
          await flowsApi.delete(item.id);
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
      const { flowIds, folderIds } = getSelectedIdsByType(selectedItems);
      await Promise.all([
        ...flowIds.map((id) => flowsApi.delete(id)),
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
      const { flowIds } = getSelectedIdsByType(selectedItems);
      const folderId =
        isNil(targetFolderId) || targetFolderId === UncategorizedFolderId
          ? null
          : targetFolderId;
      await Promise.all(
        flowIds.map((id) =>
          flowsApi.update(id, {
            type: FlowOperationType.CHANGE_FOLDER,
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
      if (item.type === 'flow') {
        await flowsApi.update(item.id, {
          type: FlowOperationType.CHANGE_NAME,
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

  const { mutate: duplicateFlow, isPending: isDuplicating } = useMutation({
    mutationFn: async (flow: PopulatedFlow) => {
      const version = flow.version;
      const displayName = `${version.displayName} - Copy`;
      const createdFlow = await flowsApi.create({
        displayName,
        workspaceId: flow.workspaceId,
        folderId: flow.folderId ?? undefined,
      });
      return flowsApi.update(createdFlow.id, {
        type: FlowOperationType.IMPORT_FLOW,
        request: {
          displayName,
          trigger: version.trigger,
          schemaVersion: version.schemaVersion,
          notes: version.notes,
        },
      });
    },
    onSuccess: (data) => {
      openNewWindow(`/flows/${data.id}`);
      deps.invalidateAll();
      toast.success(t('Flow duplicated successfully'));
    },
    onError: () => toast.error(t('Failed to duplicate flow')),
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
      if (item.type === 'flow') {
        await flowsApi.update(item.id, {
          type: FlowOperationType.CHANGE_FOLDER,
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
      const { flowIds } = getSelectedIdsByType(selectedItems);

      if (flowIds.length > 0) {
        const flowsById = new Map(
          deps.treeItems
            .filter(isFlowTreeItem)
            .map((item) => [item.id, item.data]),
        );
        const flowsToExport = flowIds
          .map((id) => flowsById.get(id))
          .filter((flow): flow is PopulatedFlow => !isNil(flow));
        if (flowsToExport.length > 0) {
          exportFlows(flowsToExport);
        }
      }

      deps.clearSelection();
    },
    [deps, exportFlows],
  );

  const handleExportFlow = useCallback(
    (flow: PopulatedFlow) => {
      exportFlows([flow]);
    },
    [exportFlows],
  );

  return {
    createFlow: (folderId?: string) => startFromScratch(folderId),
    isCreateFlowPending,
    handleDeleteItem: deleteItem,
    handleBulkDelete: bulkDelete,
    handleBulkMoveTo: (
      selectedItems: SelectedItemsMap,
      targetFolderId: string,
    ) => bulkMoveTo({ selectedItems, targetFolderId }),
    handleBulkExport,
    handleRename: (item: TreeItem, newName: string) =>
      rename({ item, newName }),
    handleDuplicateFlow: duplicateFlow,
    handleMoveItem: (item: TreeItem, targetFolderId: string) =>
      moveItem({ item, targetFolderId }),
    handleExportFlow,
    isDeleting,
    isMoving: isBulkMoving || isMovingItem,
    isRenaming,
    isDuplicating,
    isExporting: isExportFlowsPending,
  };
}

function isFlowTreeItem(
  item: TreeItem,
): item is TreeItem & { data: PopulatedFlow } {
  return item.type === 'flow' && !isNil(item.data);
}
