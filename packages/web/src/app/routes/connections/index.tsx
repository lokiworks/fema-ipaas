import {
  AccessibleConnection,
  connectionAccessUtils,
  ConnectionOwnershipFilter,
  ConnectionPermission,
  ConnectionStatus,
  ListAccessibleConnectionsRequestQuery,
} from '@fema-ipaas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import {
  Activity,
  Clock,
  Globe,
  Link2,
  MoreHorizontal,
  Puzzle,
  User,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { NewConnectionDialog } from '@/app/connections/new-connection-dialog';
import { ReconnectConnectionDialog } from '@/app/connections/reconnect-connection-dialog';
import { AnimatedIconButton } from '@/components/custom/animated-icon-button';
import {
  CURSOR_QUERY_PARAM,
  DataTable,
  LIMIT_QUERY_PARAM,
  RowDataWithActions,
} from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { FormattedDate } from '@/components/custom/formatted-date';
import { StatusIconWithText } from '@/components/custom/status-icon-with-text';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { UserBadge } from '@/components/custom/user-badge';
import { PlusIcon } from '@/components/icons/plus';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ConnectionAccessDialog } from '@/features/connections/components/connection-access-dialog';
import { ConnectionDetailSheet } from '@/features/connections/components/connection-detail-sheet';
import {
  ConnectionPermissionTag,
  ConnectionScopeCell,
} from '@/features/connections/components/connection-list-cells';
import { ConnectionUsagePopover } from '@/features/connections/components/connection-usage-popover';
import { DeleteConnectionDialog } from '@/features/connections/components/delete-connection-dialog';
import { RenameConnectionDialog } from '@/features/connections/components/rename-connection-dialog';
import { ShareConnectionDialog } from '@/features/connections/components/share-connection-dialog';
import {
  connectionAccessQueryKeys,
  connectionsMutations,
  connectionsQueries,
} from '@/features/connections/hooks/connections-hooks';
import { connectionAccessUiUtils } from '@/features/connections/utils/connection-access-utils';
import { connectionUtils } from '@/features/connections/utils/utils';
import {
  ConnectorIconWithConnectorName,
  connectorsHooks,
} from '@/features/connectors';
import { projectCollectionUtils } from '@/features/projects';

const OWNERSHIP_OPTIONS: { value: ConnectionOwnershipFilter; label: string }[] =
  [
    { value: ConnectionOwnershipFilter.ALL, label: t('All') },
    { value: ConnectionOwnershipFilter.MINE, label: t('Created by me') },
    { value: ConnectionOwnershipFilter.SHARED, label: t('Shared with me') },
  ];

type ActiveDialog = {
  type: 'reconnect' | 'edit' | 'access' | 'share' | 'delete';
  connectionId: string;
} | null;

function ConnectionsPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState(
    searchParams.get('search') ?? '',
  );
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [missingConnectionWarning, setMissingConnectionWarning] =
    useState(false);

  const detailId = searchParams.get('id');
  const setDetailId = (id: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) {
          next.set('id', id);
        } else {
          next.delete('id');
        }
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchInput) {
            next.set('search', searchInput);
          } else {
            next.delete('search');
          }
          next.delete(CURSOR_QUERY_PARAM);
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const cursor = searchParams.get(CURSOR_QUERY_PARAM) ?? undefined;
  const limit = searchParams.get(LIMIT_QUERY_PARAM)
    ? parseInt(searchParams.get(LIMIT_QUERY_PARAM)!)
    : 10;
  const search = searchParams.get('search') ?? undefined;
  const connectorName = searchParams.get('connectorName') ?? undefined;
  const statusGroup = searchParams.get('statusGroup') ?? undefined;
  const availableInProjectId =
    searchParams.get('availableInProjectId') ?? undefined;
  const ownership = connectionAccessUiUtils.parseOwnershipFilter(
    searchParams.get('ownership'),
  );

  const status: ConnectionStatus[] | undefined =
    statusGroup === 'ACTIVE'
      ? [ConnectionStatus.ACTIVE]
      : statusGroup === 'BROKEN'
      ? [
          ConnectionStatus.ERROR,
          ConnectionStatus.EXPIRED,
          ConnectionStatus.MISSING,
        ]
      : undefined;

  const request: ListAccessibleConnectionsRequestQuery = {
    cursor,
    limit,
    search,
    connectorName,
    status,
    availableInProjectId,
    ownership,
  };

  const {
    data: connections,
    isLoading: connectionsLoading,
    isError: connectionsError,
  } = connectionsQueries.useAccessibleConnections({
    request,
    extraKeys: [location.search],
  });

  const { isError: detailError } = connectionsQueries.useConnectionDetail({
    connectionId: detailId,
  });

  useEffect(() => {
    if (detailId && detailError) {
      setMissingConnectionWarning(true);
      setDetailId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId, detailError]);

  const { connectors } = connectorsHooks.useConnectors({
    skipProjectFilter: true,
  });
  const connectorOptions = (connectors ?? []).map((connector) => ({
    label: connector.displayName,
    value: connector.name,
  }));
  const { data: myProjects } = projectCollectionUtils.useAll();

  const { mutate: revalidateConnection } =
    connectionsMutations.useRevalidateConnection();
  const invalidateAccessible = () => {
    queryClient.invalidateQueries({ queryKey: ['connections-accessible'] });
  };

  const filtering = Boolean(
    search ||
      connectorName ||
      statusGroup ||
      availableInProjectId ||
      ownership !== ConnectionOwnershipFilter.ALL,
  );
  const clearFilters = () => {
    setSearchInput('');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        [
          'search',
          'connectorName',
          'statusGroup',
          'availableInProjectId',
          'ownership',
          CURSOR_QUERY_PARAM,
        ].forEach((key) => next.delete(key));
        return next;
      },
      { replace: true },
    );
  };

  const setFilterParam = (key: string, value: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        next.delete(CURSOR_QUERY_PARAM);
        return next;
      },
      { replace: true },
    );
  };

  const activeConnection = connections?.data.find(
    (connection) => connection.id === activeDialog?.connectionId,
  );

  const columns: ColumnDef<
    RowDataWithActions<AccessibleConnection>,
    unknown
  >[] = [
    {
      accessorKey: 'displayName',
      size: 280,
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
              <span className="truncate text-xs text-muted-foreground">
                {accountIdentifier ? `${accountIdentifier}` : '-'}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      size: 140,
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
      accessorKey: 'allProjects',
      size: 160,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Available Projects')}
          icon={Globe}
        />
      ),
      cell: ({ row }) => (
        <ConnectionScopeCell
          allProjects={row.original.allProjects}
          projects={row.original.projects}
        />
      ),
    },
    {
      accessorKey: 'workflowIds',
      size: 130,
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
      accessorKey: 'ownerId',
      size: 140,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Owner')} icon={User} />
      ),
      cell: ({ row }) => (
        <UserBadge id={row.original.ownerId ?? null} size="small" includeName />
      ),
    },
    {
      accessorKey: 'myPermission',
      size: 96,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('My Permission')} />
      ),
      cell: ({ row }) => (
        <ConnectionPermissionTag permission={row.original.myPermission} />
      ),
    },
    {
      accessorKey: 'updated',
      size: 150,
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
    {
      id: 'actions',
      size: 200,
      cell: ({ row }) => {
        const connection = row.original;
        const manage = connectionAccessUtils.canManage(connection.myPermission);
        const isOwner = connection.myPermission === ConnectionPermission.OWNER;
        const primaryAction = connectionAccessUiUtils.getPrimaryAction({
          myPermission: connection.myPermission,
          isActive: connection.status === ConnectionStatus.ACTIVE,
        });
        return (
          <div
            className="flex items-center justify-end gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {primaryAction === 'view' && (
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={() => setDetailId(connection.id)}
              >
                {t('View')}
              </Button>
            )}
            {primaryAction === 'reconnect' && (
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={() =>
                  setActiveDialog({
                    type: 'reconnect',
                    connectionId: connection.id,
                  })
                }
              >
                {t('Reconnect')}
              </Button>
            )}
            {primaryAction === 'edit' && (
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={() =>
                  setActiveDialog({ type: 'edit', connectionId: connection.id })
                }
              >
                {t('Edit Connection')}
              </Button>
            )}
            {manage && (
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={() =>
                  setActiveDialog({
                    type: 'share',
                    connectionId: connection.id,
                  })
                }
              >
                {t('Share')}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={t('More actions')}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDetailId(connection.id)}>
                  {t('View Details')}
                </DropdownMenuItem>
                {manage && (
                  <DropdownMenuItem
                    onSelect={() =>
                      setActiveDialog({
                        type: 'edit',
                        connectionId: connection.id,
                      })
                    }
                  >
                    {t('Edit Connection')}
                  </DropdownMenuItem>
                )}
                {manage && (
                  <DropdownMenuItem
                    onSelect={() =>
                      setActiveDialog({
                        type: 'reconnect',
                        connectionId: connection.id,
                      })
                    }
                  >
                    {t('Reconnect')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => {
                    revalidateConnection(connection.id, {
                      onSuccess: invalidateAccessible,
                    });
                  }}
                >
                  {t('Test Connection')}
                </DropdownMenuItem>
                {manage && (
                  <DropdownMenuItem
                    onSelect={() =>
                      setActiveDialog({
                        type: 'access',
                        connectionId: connection.id,
                      })
                    }
                  >
                    {t('Available projects')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <DropdownMenuItem
                        disabled={!isOwner}
                        variant="destructive"
                        onSelect={() =>
                          setActiveDialog({
                            type: 'delete',
                            connectionId: connection.id,
                          })
                        }
                      >
                        {t('Delete')}
                      </DropdownMenuItem>
                    </div>
                  </TooltipTrigger>
                  {!isOwner && (
                    <TooltipContent>
                      {t('Only the owner can delete this connection')}
                    </TooltipContent>
                  )}
                </Tooltip>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex w-full flex-col">
      <div className="flex items-start justify-between px-4 pt-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-base font-semibold">{t('Connections')}</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            {t(
              'Connections store the accounts and secrets needed to access third-party apps. They belong to their creator and can be shared with teammates to use or co-edit.',
            )}
          </p>
        </div>
        <NewConnectionDialog
          isGlobalConnection={false}
          onConnectionCreated={invalidateAccessible}
        >
          <AnimatedIconButton icon={PlusIcon} iconSize={16} size="sm">
            {t('New Connection')}
          </AnimatedIconButton>
        </NewConnectionDialog>
      </div>
      <DataTable
        emptyStateTextTitle={
          filtering
            ? t('No connections match these filters')
            : t('No connections yet')
        }
        emptyStateTextDescription={
          filtering
            ? t('Try a different search, or clear the filters and try again.')
            : t('Create a connection so workflow steps can call this account.')
        }
        emptyStateIcon={<Link2 className="size-14" />}
        columns={columns}
        page={connections}
        isLoading={connectionsLoading}
        isError={connectionsError}
        onRowClick={(row) => setDetailId(row.id)}
        getRowClassName={(row) => (row.id === detailId ? 'bg-accent/40' : '')}
        customFilters={[
          <Input
            key="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('Search by name, account or connector')}
            className="w-64"
          />,
          <Select
            key="connectorName"
            value={connectorName ?? 'ALL'}
            onValueChange={(value) =>
              setFilterParam('connectorName', value === 'ALL' ? null : value)
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('App')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('All Apps')}</SelectItem>
              {connectorOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>,
          <Select
            key="statusGroup"
            value={statusGroup ?? 'ALL'}
            onValueChange={(value) =>
              setFilterParam('statusGroup', value === 'ALL' ? null : value)
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder={t('Status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('All')}</SelectItem>
              <SelectItem value="ACTIVE">{t('Connected')}</SelectItem>
              <SelectItem value="BROKEN">{t('Needs action')}</SelectItem>
            </SelectContent>
          </Select>,
          <Select
            key="availableInProjectId"
            value={availableInProjectId ?? 'ALL'}
            onValueChange={(value) =>
              setFilterParam(
                'availableInProjectId',
                value === 'ALL' ? null : value,
              )
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('Available Projects')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('All Projects')}</SelectItem>
              {myProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>,
          ...(filtering
            ? [
                <Button
                  key="clear"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  {t('Clear Filters')}
                </Button>,
              ]
            : []),
        ]}
        toolbarButtons={[
          <div
            key="ownership"
            className="flex items-center gap-1 rounded-md bg-muted p-1"
          >
            {OWNERSHIP_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={ownership === option.value ? 'secondary' : 'ghost'}
                className="h-7"
                onClick={() =>
                  setFilterParam(
                    'ownership',
                    option.value === ConnectionOwnershipFilter.ALL
                      ? null
                      : option.value,
                  )
                }
              >
                {option.label}
              </Button>
            ))}
          </div>,
        ]}
      />
      {missingConnectionWarning && (
        <div className="px-4 pt-2">
          <Alert variant="warning">
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>
                {t(
                  'The link points to a connection that does not exist, or has not been shared with you.',
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={t('Close')}
                onClick={() => setMissingConnectionWarning(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
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
            invalidateAccessible();
            if (detailId === activeDialog.connectionId) {
              setDetailId(null);
            }
          }}
        />
      )}
      {activeDialog?.type === 'reconnect' && (
        <ReconnectConnectionDialog
          connectionId={activeDialog.connectionId}
          open
          onOpenChange={(open) => !open && setActiveDialog(null)}
          onReconnected={() => {
            invalidateAccessible();
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
          onRename={invalidateAccessible}
        />
      )}
    </div>
  );
}

export { ConnectionsPage };
