import {
  ConnectionScope,
  ConnectionStatus,
  MAX_TENANT_CONNECTION_OWNERS,
  TenantConnectionsListItem,
} from '@fema-ipaas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import {
  Activity,
  CheckIcon,
  Clock,
  Folder,
  Globe,
  Puzzle,
  Unplug,
  User,
  Workflow,
} from 'lucide-react';
import { useState } from 'react';

import { ReconnectConnectionDialog } from '@/app/connections/reconnect-connection-dialog';
import { ConsolePage } from '@/components/custom/console-page';
import {
  DataTable,
  DataTableFilters,
  RowDataWithActions,
} from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { FormattedDate } from '@/components/custom/formatted-date';
import { StatusIconWithText } from '@/components/custom/status-icon-with-text';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { UserBadge } from '@/components/custom/user-badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { connectionUtils } from '@/features/connections';
import { ConnectionAccessDialog } from '@/features/connections/components/connection-access-dialog';
import { ConnectionDetailSheet } from '@/features/connections/components/connection-detail-sheet';
import { ConnectionScopeCell } from '@/features/connections/components/connection-list-cells';
import { ConnectionUsagePopover } from '@/features/connections/components/connection-usage-popover';
import { DeleteConnectionDialog } from '@/features/connections/components/delete-connection-dialog';
import { RenameConnectionDialog } from '@/features/connections/components/rename-connection-dialog';
import { ShareConnectionDialog } from '@/features/connections/components/share-connection-dialog';
import { connectionAccessQueryKeys } from '@/features/connections/hooks/connections-hooks';
import {
  ConnectorIconWithConnectorName,
  connectorsHooks,
} from '@/features/connectors';
import { getProjectName, projectCollectionUtils } from '@/features/projects';
import {
  tenantConnectionsKeys,
  tenantConnectionsQueries,
} from '@/features/tenant-admin/hooks/tenant-connections-hooks';
import { useIsNarrowDesktop } from '@/hooks/use-mobile';

export default function TenantConnectionsPage() {
  const compact = useIsNarrowDesktop();
  const queryClient = useQueryClient();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog | null>(null);
  const {
    data: connections,
    isLoading,
    isError,
  } = tenantConnectionsQueries.useList();
  const { data: owners } = tenantConnectionsQueries.useOwners();
  const { data: projects } = projectCollectionUtils.useAllTenantProjects();
  const { connectors } = connectorsHooks.useConnectors({});

  const activeConnection = (connections?.data ?? []).find(
    (connection) => connection.id === activeDialog?.connectionId,
  );
  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: [TENANT_CONNECTIONS_KEY] });
    queryClient.invalidateQueries({
      queryKey: tenantConnectionsKeys.owners(),
    });
  };

  const filters: DataTableFilters<
    keyof TenantConnectionsListItem | 'ownerIds'
  >[] = [
    {
      type: 'input',
      title: t('Name'),
      accessorKey: 'displayName',
      icon: Unplug,
    },
    {
      type: 'select',
      title: t('Status'),
      accessorKey: 'status',
      icon: CheckIcon,
      options: Object.values(ConnectionStatus).map((status) => ({
        label: connectionUtils.getStatusLabel(status),
        value: status,
      })),
    },
    {
      type: 'select',
      title: t('Connector'),
      accessorKey: 'connectorName',
      icon: Puzzle,
      options: (connectors ?? []).map((connector) => ({
        label: connector.displayName,
        value: connector.name,
      })),
    },
    {
      type: 'select',
      title: t('Available projects'),
      accessorKey: 'projectIds',
      icon: Folder,
      options: (projects ?? []).map((project) => ({
        label: getProjectName(project),
        value: project.id,
      })),
    },
    {
      type: 'select',
      title: t('Owner'),
      accessorKey: 'ownerIds',
      icon: User,
      options: (owners?.data ?? []).map((owner) => ({
        label: owner.email,
        value: owner.id,
      })),
    },
  ];

  const columns: ColumnDef<RowDataWithActions<TenantConnectionsListItem>>[] = [
    {
      accessorKey: 'displayName',
      size: 240,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Name')}
          icon={Puzzle}
        />
      ),
      cell: ({ row }) => {
        const accountIdentifier =
          connectionUtils.getConnectionAccountIdentifier(row.original);
        return (
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0">
              <ConnectorIconWithConnectorName
                connectorName={row.original.connectorName}
                showTooltip={false}
                size="sm"
              />
            </span>
            <div className="flex min-w-0 flex-col">
              <TextWithTooltip tooltipMessage={row.original.displayName}>
                <span className="min-w-0">{row.original.displayName}</span>
              </TextWithTooltip>
              {accountIdentifier && (
                <span className="truncate text-xs text-muted-foreground">
                  {accountIdentifier}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      size: 120,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Status')}
          icon={Activity}
        />
      ),
      cell: ({ row }) => {
        const { variant, icon: Icon } = connectionUtils.getStatusIcon(
          row.original.status,
        );
        const isActive = row.original.status === ConnectionStatus.ACTIVE;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-fit">
                <StatusIconWithText
                  icon={Icon}
                  text={connectionUtils.getStatusLabel(row.original.status)}
                  variant={variant}
                />
              </div>
            </TooltipTrigger>
            {!isActive && (
              <TooltipContent>
                {connectionUtils.getBrokenReason(row.original.status)}
              </TooltipContent>
            )}
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'projects',
      size: 170,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Available Projects')}
          icon={Globe}
        />
      ),
      cell: ({ row }) => (
        <ConnectionScopeCell
          allProjects={row.original.scope === ConnectionScope.TENANT}
          projects={row.original.projects.map((project) => ({
            id: project.id,
            displayName: getProjectName(project),
          }))}
        />
      ),
    },
    {
      accessorKey: 'workflowIds',
      size: 110,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('References')}
          icon={Workflow}
        />
      ),
      cell: ({ row }) => <ConnectionUsagePopover connection={row.original} />,
    },
    {
      accessorKey: 'owner',
      size: 150,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Owner')} icon={User} />
      ),
      cell: ({ row }) => (
        <UserBadge id={row.original.ownerId ?? null} size="small" includeName />
      ),
    },
    {
      accessorKey: 'updated',
      size: 120,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Connected At')}
          icon={Clock}
        />
      ),
      cell: ({ row }) => (
        <FormattedDate date={new Date(row.original.updated)} />
      ),
    },
  ];

  return (
    <ConsolePage
      title={t('Connection overview')}
      description={t('All app connections across every project on this tenant')}
    >
      {owners?.truncated && (
        <div className="text-xs text-muted-foreground">
          {t('Owner filter is limited to the first {count} owners', {
            count: MAX_TENANT_CONNECTION_OWNERS,
          })}
        </div>
      )}
      <DataTable
        emptyStateTextTitle={t('No connections found')}
        emptyStateTextDescription={t(
          'Connections created in any project on this tenant will appear here.',
        )}
        emptyStateIcon={<Unplug className="size-14" />}
        columns={compact ? compactColumns({ columns }) : columns}
        page={connections}
        isLoading={isLoading}
        isError={isError}
        filters={filters}
        onRowClick={(row) => setDetailId(row.id)}
      />
      <ConnectionDetailSheet
        connectionId={detailId}
        onClose={() => setDetailId(null)}
        onShare={(id) => setActiveDialog({ type: 'share', connectionId: id })}
        onEdit={(id) => setActiveDialog({ type: 'edit', connectionId: id })}
        onReconnect={(id) =>
          setActiveDialog({ type: 'reconnect', connectionId: id })
        }
        onDelete={(id) => setActiveDialog({ type: 'delete', connectionId: id })}
        onAccess={(id) => setActiveDialog({ type: 'access', connectionId: id })}
      />
      {activeDialog?.type === 'share' && (
        <ShareConnectionDialog
          connectionId={activeDialog.connectionId}
          open
          onOpenChange={(open) => !open && setActiveDialog(null)}
        />
      )}
      {activeDialog?.type === 'access' && (
        <ConnectionAccessDialog
          connectionId={activeDialog.connectionId}
          open
          onOpenChange={(open) => !open && setActiveDialog(null)}
        />
      )}
      {activeDialog?.type === 'delete' && (
        <DeleteConnectionDialog
          connectionId={activeDialog.connectionId}
          open
          onOpenChange={(open) => !open && setActiveDialog(null)}
          onDeleted={() => {
            invalidateList();
            setDetailId(null);
          }}
        />
      )}
      {activeDialog?.type === 'reconnect' && (
        <ReconnectConnectionDialog
          connectionId={activeDialog.connectionId}
          open
          onOpenChange={(open) => !open && setActiveDialog(null)}
          onReconnected={() => {
            invalidateList();
            queryClient.invalidateQueries({
              queryKey: connectionAccessQueryKeys.detail(
                activeDialog.connectionId,
              ),
            });
          }}
        />
      )}
      {activeDialog?.type === 'edit' && activeConnection && (
        <RenameConnectionDialog
          connectionId={activeConnection.id}
          currentName={activeConnection.displayName}
          userHasPermissionToRename
          open
          hideTrigger
          onOpenChange={(open) => !open && setActiveDialog(null)}
          onRename={invalidateList}
        />
      )}
    </ConsolePage>
  );
}

function compactColumns({
  columns,
}: {
  columns: ColumnDef<RowDataWithActions<TenantConnectionsListItem>>[];
}): ColumnDef<RowDataWithActions<TenantConnectionsListItem>>[] {
  return columns
    .filter(
      (column) =>
        !('accessorKey' in column) || column.accessorKey !== 'updated',
    )
    .map((column) => ({
      ...column,
      size:
        'accessorKey' in column
          ? COMPACT_COLUMN_SIZES[String(column.accessorKey)] ?? column.size
          : column.size,
    }));
}

const COMPACT_COLUMN_SIZES: Record<string, number> = {
  displayName: 190,
  status: 110,
  projects: 150,
  workflowIds: 110,
  owner: 130,
};

const TENANT_CONNECTIONS_KEY = 'tenant-connections';

type ActiveDialog = {
  type: 'reconnect' | 'edit' | 'access' | 'share' | 'delete';
  connectionId: string;
};
