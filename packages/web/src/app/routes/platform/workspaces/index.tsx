import { WorkspaceType, WorkspaceWithLimits } from '@fema/shared';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import { CheckIcon, Package, Pencil, Trash } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { DashboardPageHeader } from '@/app/components/dashboard-page-header';
import LockedFeatureGuard from '@/app/components/locked-feature-guard';
import {
  DataTable,
  RowDataWithActions,
  BulkAction,
} from '@/components/custom/data-table';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { globalConnectionsQueries } from '@/features/connections';
import {
  CreateWorkspaceButton,
  EditWorkspaceDialog,
  workspaceCollectionUtils,
} from '@/features/workspaces';
import { platformHooks } from '@/hooks/platform-hooks';
import { formatUtils } from '@/lib/format-utils';
import { validationUtils } from '@/lib/validation-utils';

import { workspacesTableColumns } from './columns';

export default function WorkspacesPage() {
  const { platform } = platformHooks.useCurrentPlatform();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isEnabled = platform.plan.billedTeamWorkspacesLimit !== 0;
  const { workspace: currentWorkspace } =
    workspaceCollectionUtils.useCurrentWorkspace();

  useEffect(() => {
    if (!searchParams.has('type')) {
      setSearchParams(
        (prev) => {
          const newParams = new URLSearchParams(prev);
          newParams.set('type', WorkspaceType.TEAM);
          return newParams;
        },
        { replace: true },
      );
    }
  }, []);

  const displayNameFilter = searchParams.get('displayName') || undefined;
  const typeFilter = searchParams.getAll('type');

  const filters = useMemo(
    () => ({
      displayName: displayNameFilter,
      type:
        typeFilter.length > 0
          ? typeFilter.map((t) => t as WorkspaceType)
          : undefined,
    }),
    [displayNameFilter, typeFilter.join(',')],
  );

  const { data: allWorkspaces } =
    workspaceCollectionUtils.useAllPlatformWorkspaces(filters);

  const [selectedRows, setSelectedRows] = useState<WorkspaceWithLimits[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDialogInitialValues, setEditDialogInitialValues] =
    useState<any>(null);
  const [editDialogWorkspaceId, setEditDialogWorkspaceId] =
    useState<string>('');
  const { data: allGlobalConnectionsPage } =
    globalConnectionsQueries.useGlobalConnections({
      request: { limit: 9999 },
      extraKeys: [],
    });
  const allWorkspacesWithGlobalConnectionsCount = useMemo(() => {
    return allWorkspaces.map((workspace) => ({
      ...workspace,
      globalConnectionsCount:
        allGlobalConnectionsPage?.data?.filter((connection) =>
          connection.workspaceIds.includes(workspace.id),
        ).length ?? 0,
    }));
  }, [allWorkspaces, allGlobalConnectionsPage?.data]);
  const columns = useMemo(
    () =>
      workspacesTableColumns({
        platform,
      }),
    [platform],
  );

  const columnsWithCheckbox: ColumnDef<
    RowDataWithActions<WorkspaceWithLimits & { globalConnectionsCount: number }>
  >[] = [
    {
      id: 'select',
      accessorKey: 'select',
      size: 40,
      minSize: 40,
      maxSize: 40,
      header: ({ table }) => {
        const selectableRows = table
          .getRowModel()
          .rows.filter(
            (row) =>
              row.original.id !== currentWorkspace?.id &&
              row.original.type !== WorkspaceType.PERSONAL,
          );
        const allSelectableSelected =
          selectableRows.length > 0 &&
          selectableRows.every((row) => row.getIsSelected());
        const someSelectableSelected = selectableRows.some((row) =>
          row.getIsSelected(),
        );

        return (
          <Checkbox
            checked={allSelectableSelected || someSelectableSelected}
            onCheckedChange={(value) => {
              const isChecked = !!value;
              selectableRows.forEach((row) => row.toggleSelected(isChecked));

              if (isChecked) {
                const selectableWorkspaces = selectableRows.map(
                  (row) => row.original,
                );
                const newSelectedRows = [
                  ...selectableWorkspaces,
                  ...selectedRows,
                ];
                const uniqueRows = Array.from(
                  new Map(
                    newSelectedRows.map((item) => [item.id, item]),
                  ).values(),
                );
                setSelectedRows(uniqueRows);
              } else {
                const filteredRows = selectedRows.filter(
                  (row) =>
                    !selectableRows.some((r) => r.original.id === row.id),
                );
                setSelectedRows(filteredRows);
              }
            }}
          />
        );
      },
      cell: ({ row }) => {
        const isCurrentWorkspace = row.original.id === currentWorkspace?.id;
        const isPersonalWorkspace =
          row.original.type === WorkspaceType.PERSONAL;
        const isDisabled = isCurrentWorkspace || isPersonalWorkspace;
        const isChecked = selectedRows.some(
          (selectedRow) => selectedRow.id === row.original.id,
        );

        return (
          <Tooltip>
            <TooltipTrigger>
              <div className={isDisabled ? 'cursor-not-allowed' : ''}>
                <Checkbox
                  checked={isChecked}
                  disabled={isDisabled}
                  onCheckedChange={(value) => {
                    if (isDisabled) return;

                    const isChecked = !!value;
                    let newSelectedRows = [...selectedRows];
                    if (isChecked) {
                      const exists = newSelectedRows.some(
                        (selectedRow) => selectedRow.id === row.original.id,
                      );
                      if (!exists) {
                        newSelectedRows.push(row.original);
                      }
                    } else {
                      newSelectedRows = newSelectedRows.filter(
                        (selectedRow) => selectedRow.id !== row.original.id,
                      );
                    }
                    setSelectedRows(newSelectedRows);
                    row.toggleSelected(!!value);
                  }}
                />
              </div>
            </TooltipTrigger>
            {isDisabled && (
              <TooltipContent side="right">
                {isCurrentWorkspace
                  ? t(
                      'Cannot delete active workspace, switch to another workspace first',
                    )
                  : t(
                      "Personal workspaces cannot be deleted, and you can't subscribe to their alerts",
                    )}
              </TooltipContent>
            )}
          </Tooltip>
        );
      },
    },
    ...columns,
  ];

  const bulkActions: BulkAction<WorkspaceWithLimits>[] = useMemo(
    () => [
      {
        render: (
          _: RowDataWithActions<WorkspaceWithLimits>[],
          resetSelection: () => void,
        ) => {
          const canDeleteAny = selectedRows.some(
            (row) =>
              row.id !== currentWorkspace?.id &&
              row.type !== WorkspaceType.PERSONAL,
          );
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConfirmationDeleteDialog
                title={t('Delete Workspaces')}
                message={t(
                  'The selected workspaces and all their data will be permanently deleted.',
                )}
                entityName={t('Workspaces')}
                buttonText={t('Delete')}
                mutationFn={async () => {
                  const deletableWorkspaces = selectedRows.filter(
                    (row) =>
                      row.id !== currentWorkspace?.id &&
                      row.type !== WorkspaceType.PERSONAL,
                  );
                  workspaceCollectionUtils.delete(
                    deletableWorkspaces.map((row) => row.id),
                  );
                  resetSelection();
                  setSelectedRows([]);
                }}
                onError={(error) => {
                  toast.error(t('Error'), {
                    description: errorToastMessage(error),
                    duration: 3000,
                  });
                }}
              >
                {selectedRows.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={!canDeleteAny}
                  >
                    <Trash className="mr-1 w-4" />
                    {`${t('Delete')} (${selectedRows.length})`}
                  </Button>
                )}
              </ConfirmationDeleteDialog>
            </div>
          );
        },
      },
    ],
    [selectedRows, currentWorkspace],
  );

  const toolbarButtons = useMemo(
    () => [
      <CreateWorkspaceButton
        key="new-workspace"
        variant="full"
        workspaces={allWorkspaces}
      />,
    ],
    [allWorkspaces],
  );

  const errorToastMessage = (error: unknown): string | undefined => {
    if (validationUtils.isValidationError(error)) {
      console.error(t('Validation error'), error);
      switch (error.response?.data?.params?.message) {
        case 'WORKSPACE_HAS_ENABLED_WORKFLOWS':
          return t(
            'Workspace has enabled workflows. Please disable them first.',
          );
        case 'ACTIVE_WORKSPACE':
          return t(
            'This workspace is active. Please switch to another workspace first.',
          );
      }
      return undefined;
    }
  };

  const actions = [
    (row: WorkspaceWithLimits) => {
      return (
        <div className="flex items-end justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="size-8 p-0"
                onClick={async (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setEditDialogInitialValues({
                    workspaceName: row.displayName,
                  });
                  setEditDialogWorkspaceId(row.id);
                  setEditDialogOpen(true);
                }}
              >
                <Pencil className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('Edit workspace')}</TooltipContent>
          </Tooltip>
        </div>
      );
    },
  ];

  return (
    <LockedFeatureGuard
      featureKey="WORKSPACES"
      locked={!isEnabled}
      lockTitle={t('Unlock Workspaces')}
      lockDescription={t(
        'Orchestrate your automation teams across workspaces with their own workflows, connections and usage quotas',
      )}
    >
      <div className="flex flex-col w-full">
        <DashboardPageHeader
          title={t('Workspaces')}
          description={t('Manage your automation workspaces')}
        />
        <DataTable
          emptyStateTextTitle={t('No workspaces found')}
          emptyStateTextDescription={t(
            'Start by creating workspaces to manage your automation teams',
          )}
          emptyStateIcon={<Package className="size-14" />}
          onRowClick={async (workspace) => {
            await workspaceCollectionUtils.setCurrentWorkspace(workspace.id);
            navigate('/');
          }}
          filters={[
            {
              type: 'input',
              title: t('Name'),
              accessorKey: 'displayName',
              icon: CheckIcon,
            },
            {
              type: 'select',
              title: t('Type'),
              accessorKey: 'type',
              options: Object.values(WorkspaceType).map((type) => {
                return {
                  label:
                    formatUtils.convertEnumToHumanReadable(type) + ' Workspace',
                  value: type,
                };
              }),
              icon: CheckIcon,
            },
          ]}
          columns={columnsWithCheckbox}
          page={{
            data: allWorkspacesWithGlobalConnectionsCount,
            next: null,
            previous: null,
          }}
          isLoading={false}
          clientPagination={true}
          bulkActions={bulkActions}
          toolbarButtons={toolbarButtons}
          actions={actions}
        />
        <EditWorkspaceDialog
          open={editDialogOpen}
          onClose={() => {
            setEditDialogOpen(false);
          }}
          initialValues={editDialogInitialValues}
          workspaceId={editDialogWorkspaceId}
        />
      </div>
    </LockedFeatureGuard>
  );
}
