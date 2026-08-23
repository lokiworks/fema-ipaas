import { Permission } from '@fema-ipaas/core-utils';
import { UncategorizedFolderId } from '@fema-ipaas/shared';
import { useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { recordAccess } from '@/app/components/global-search/access-history';
import { AutomationsEmptyState } from '@/features/automations/components/automations-empty-state';
import { AutomationsFilters as AutomationsFiltersComponent } from '@/features/automations/components/automations-filters';
import { AutomationsNoResultsState } from '@/features/automations/components/automations-no-results-state';
import { AutomationsPagination } from '@/features/automations/components/automations-pagination';
import { AutomationsSelectionBar } from '@/features/automations/components/automations-selection-bar';
import { AutomationsTable } from '@/features/automations/components/automations-table';
import { CreateFolderDialog } from '@/features/automations/components/create-folder-dialog';
import { CreateInFolderKind } from '@/features/automations/components/create-new-menu';
import { MoveToFolderDialog } from '@/features/automations/components/move-to-folder-dialog';
import { RenameDialog } from '@/features/automations/components/rename-dialog';
import { useAutomationsData } from '@/features/automations/hooks/use-automations-data';
import { useAutomationsDialogs } from '@/features/automations/hooks/use-automations-dialogs';
import { useAutomationsFilters } from '@/features/automations/hooks/use-automations-filters';
import { useAutomationsMutations } from '@/features/automations/hooks/use-automations-mutations';
import {
  useAutomationsSelection,
  hasMovableOrExportableItems,
} from '@/features/automations/hooks/use-automations-selection';
import { usePinnedItems } from '@/features/automations/hooks/use-pinned-items';
import { TreeItem } from '@/features/automations/lib/types';
import { connectionsQueries } from '@/features/connections';
import { connectorsHooks } from '@/features/connectors';
import { ImportWorkflowDialog } from '@/features/workflows/components/import-workflow-dialog';
import {
  workspaceCollectionUtils,
  getWorkspaceName,
} from '@/features/workspaces';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';

export const AutomationsPage = () => {
  const { workspaceId: workspaceIdFromUrl } = useParams<{
    workspaceId: string;
  }>();
  const workspaceId =
    workspaceIdFromUrl ?? authenticationSession.getWorkspaceId()!;

  return <AutomationsPageContent key={workspaceId} workspaceId={workspaceId} />;
};

const AutomationsPageContent = ({ workspaceId }: { workspaceId: string }) => {
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: allWorkspaces = [] } = workspaceCollectionUtils.useAll();
  const currentWorkspaceName = (() => {
    const p = allWorkspaces.find((proj) => proj.id === workspaceId);
    return p ? getWorkspaceName(p) : null;
  })();

  const { checkAccess } = useAuthorization();
  const userHasPermissionToWriteWorkflow = checkAccess(
    Permission.WRITE_WORKFLOW,
  );
  const userHasPermissionToWriteFolder = checkAccess(Permission.WRITE_FOLDER);

  const {
    searchInput,
    handleSearchChange,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    connectionFilter,
    setConnectionFilter,
    ownerFilter,
    setOwnerFilter,
    folderFilter,
    setFolderFilter,
    filters,
    filtersActive,
    clearAllFilters,
  } = useAutomationsFilters();

  const { pinnedList, isPinned, togglePin, unpinItem } = usePinnedItems();

  const {
    treeItems,
    folders,
    rootWorkflows,
    isLoading,
    expandedFolders,
    toggleFolder,
    loadMoreInFolder,
    rootPage,
    pageSize,
    changePageSize,
    totalPages,
    nextRootPage,
    prevRootPage,
    resetPagination,
    invalidateAll,
    invalidateRoot,
    invalidateFolder,
  } = useAutomationsData(filters, pinnedList);

  const expandFolderIfCollapsed = useCallback(
    (folderId: string) => {
      if (!expandedFolders.has(folderId)) {
        toggleFolder(folderId);
      }
    },
    [expandedFolders, toggleFolder],
  );

  const {
    selectedItems,
    toggleItemSelection,
    toggleAllSelection,
    clearSelection,
    isItemSelected,
    selectableItems,
  } = useAutomationsSelection(treeItems);

  const mutations = useAutomationsMutations({
    invalidateAll,
    invalidateRoot,
    invalidateFolder,
    clearSelection,
    treeItems,
    unpinItem,
  });

  const dialogs = useAutomationsDialogs({ mutations, selectedItems });

  const { data: connections } = connectionsQueries.useConnections({
    request: { workspaceId, limit: 10000 },
    extraKeys: [workspaceId],
  });

  const { connectors } = connectorsHooks.useConnectors({});

  // Bulk actions resolve selected items from the loaded treeItems, so the
  // selection must never outlive the view that produced it. Clearing it on
  // every view change (filtering, paging, collapsing a folder) keeps the
  // selection a subset of what is currently loaded.
  const handleFiltersChange = useCallback(() => {
    clearSelection();
    resetPagination();
  }, [clearSelection, resetPagination]);

  const handleNextPage = useCallback(() => {
    clearSelection();
    nextRootPage();
  }, [clearSelection, nextRootPage]);

  const handlePrevPage = useCallback(() => {
    clearSelection();
    prevRootPage();
  }, [clearSelection, prevRootPage]);

  const handlePageSizeChange = useCallback(
    (size: number) => {
      clearSelection();
      changePageSize(size);
    },
    [clearSelection, changePageSize],
  );

  const handleRowClick = useCallback(
    (item: TreeItem, ctrlKey?: boolean) => {
      if (item.type === 'folder') {
        if (expandedFolders.has(item.id)) {
          clearSelection();
        }
        toggleFolder(item.id);
      } else if (item.type === 'workflow') {
        const href = authenticationSession.appendWorkspaceRoutePrefix(
          `/workflows/${item.id}`,
        );
        const workflowData = item.data as {
          status?: 'ENABLED' | 'DISABLED';
        } | null;
        const folderName = item.folderId
          ? folders.find((f) => f.id === item.folderId)?.displayName ?? null
          : null;
        recordAccess({
          id: `workflow-${item.id}`,
          type: 'workflow',
          label: item.name,
          href,
          status: workflowData?.status ?? null,
          folderName,
          workspaceName: currentWorkspaceName,
        });
        if (ctrlKey) {
          window.open(href, '_blank');
        } else {
          navigate(href);
        }
      }
    },
    [
      navigate,
      toggleFolder,
      folders,
      currentWorkspaceName,
      clearSelection,
      expandedFolders,
    ],
  );

  const handleCreateInFolder = useCallback(
    (folderId: string, kind: CreateInFolderKind) => {
      switch (kind) {
        case 'workflow':
          mutations.createWorkflow(folderId);
          break;
        case 'import-workflow':
          expandFolderIfCollapsed(folderId);
          dialogs.setImportTargetFolderId(folderId);
          dialogs.setIsImportWorkflowDialogOpen(true);
          break;
      }
    },
    [expandFolderIfCollapsed, mutations, dialogs],
  );

  const updateSearchParams = (newFolderId: string | undefined) => {
    setSearchParams(
      (prev) => {
        const newParams = new URLSearchParams(prev);
        if (newFolderId) {
          newParams.set('folderId', newFolderId);
        } else {
          newParams.delete('folderId');
        }
        return newParams;
      },
      { replace: true },
    );
  };

  const hasAnyItems = rootWorkflows.length > 0 || folders.length > 0;
  const isEmptyState = !hasAnyItems && !isLoading && !filtersActive;
  const isNoResultsState =
    treeItems.length === 0 && filtersActive && !isLoading;

  if (isEmptyState) {
    return <AutomationsEmptyState onRefresh={() => invalidateAll()} />;
  }

  return (
    <div className="flex flex-col w-full">
      <AutomationsFiltersComponent
        searchTerm={searchInput}
        onSearchChange={handleSearchChange}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        connectionFilter={connectionFilter}
        onConnectionFilterChange={setConnectionFilter}
        ownerFilter={ownerFilter}
        onOwnerFilterChange={setOwnerFilter}
        folderFilter={folderFilter}
        onFolderFilterChange={setFolderFilter}
        onFilterChange={handleFiltersChange}
        folders={folders}
        connections={connections?.data}
        connectors={connectors}
        userHasPermissionToWriteWorkflow={userHasPermissionToWriteWorkflow}
        userHasPermissionToWriteFolder={userHasPermissionToWriteFolder}
        onCreateWorkflow={() => mutations.createWorkflow()}
        onCreateFolder={() => dialogs.setIsFolderDialogOpen(true)}
        onImportWorkflow={() => {
          dialogs.setImportTargetFolderId(undefined);
          dialogs.setIsImportWorkflowDialogOpen(true);
        }}
        onClearAllFilters={clearAllFilters}
        hasActiveFilters={filtersActive}
        isCreatingWorkflow={mutations.isCreateWorkflowPending}
      />

      {isNoResultsState ? (
        <AutomationsNoResultsState onClearFilters={clearAllFilters} />
      ) : (
        <>
          <AutomationsTable
            items={treeItems}
            isLoading={isLoading}
            selectedItems={selectedItems}
            expandedFolders={expandedFolders}
            workspaceMembers={undefined}
            folders={folders}
            selectableCount={selectableItems.length}
            isPinned={isPinned}
            onTogglePin={togglePin}
            onToggleAllSelection={toggleAllSelection}
            onToggleItemSelection={toggleItemSelection}
            onRowClick={handleRowClick}
            onRenameItem={dialogs.openRenameDialog}
            onDeleteItem={mutations.handleDeleteItem}
            onDuplicateWorkflow={mutations.handleDuplicateWorkflow}
            onMoveItem={mutations.handleMoveItem}
            onExportWorkflow={mutations.handleExportWorkflow}
            onCreateInFolder={handleCreateInFolder}
            userHasPermissionToWriteWorkflow={userHasPermissionToWriteWorkflow}
            isCreatingWorkflow={mutations.isCreateWorkflowPending}
            isMoving={mutations.isMoving}
            isDuplicating={mutations.isDuplicating}
            onLoadMoreInFolder={loadMoreInFolder}
            isItemSelected={isItemSelected}
          />

          <AutomationsPagination
            currentPage={rootPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageSizeChange={handlePageSizeChange}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
          />
        </>
      )}

      <AutomationsSelectionBar
        selectedCount={selectedItems.size}
        isDeleting={mutations.isDeleting}
        isMoving={mutations.isMoving}
        isExporting={mutations.isExporting}
        hasMovableOrExportableItems={hasMovableOrExportableItems(selectedItems)}
        onMoveClick={() => dialogs.setMoveToDialogOpen(true)}
        onDeleteClick={() => mutations.handleBulkDelete(selectedItems)}
        onExportClick={() => mutations.handleBulkExport(selectedItems)}
        onClearSelection={clearSelection}
      />

      <MoveToFolderDialog
        open={dialogs.moveToDialogOpen}
        onOpenChange={dialogs.setMoveToDialogOpen}
        folders={folders}
        selectedFolderId={dialogs.moveToFolderId}
        onFolderChange={dialogs.setMoveToFolderId}
        onConfirm={dialogs.handleBulkMoveTo}
        isMoving={mutations.isMoving}
      />

      <RenameDialog
        open={dialogs.renameDialogOpen}
        onOpenChange={dialogs.setRenameDialogOpen}
        value={dialogs.newName}
        onChange={dialogs.setNewName}
        onConfirm={dialogs.handleRename}
        isRenaming={mutations.isRenaming}
      />

      <CreateFolderDialog
        updateSearchParams={updateSearchParams}
        open={dialogs.isFolderDialogOpen}
        refetchFolders={() => invalidateAll()}
        onOpenChange={dialogs.setIsFolderDialogOpen}
      />

      <ImportWorkflowDialog
        key={dialogs.importTargetFolderId ?? 'root-import-workflow'}
        insideBuilder={false}
        folderId={dialogs.importTargetFolderId ?? UncategorizedFolderId}
        onRefresh={() => invalidateAll()}
      >
        <button
          className="hidden"
          ref={(el) => {
            if (el && dialogs.isImportWorkflowDialogOpen) {
              el.click();
              dialogs.setIsImportWorkflowDialogOpen(false);
            }
          }}
        />
      </ImportWorkflowDialog>
    </div>
  );
};
