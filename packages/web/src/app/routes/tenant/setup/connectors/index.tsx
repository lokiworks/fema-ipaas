import { ConnectorMetadataModelSummary } from '@fema-ipaas/connector-sdk';
import { ApplicationErrorParams, ErrorCode } from '@fema-ipaas/core-utils';
import { ConnectorScope, ConnectorType } from '@fema-ipaas/shared';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import {
  CheckIcon,
  Package,
  Hash,
  GitBranch,
  Layers,
  Puzzle,
  Trash,
} from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { DashboardPageHeader } from '@/app/components/dashboard-page-header';
import { ConnectorActions } from '@/app/routes/tenant/setup/connectors/connector-actions';
import { CustomizeSelectorDialog } from '@/app/routes/tenant/setup/connectors/customize-selector-dialog';
import { SyncConnectorsButton } from '@/app/routes/tenant/setup/connectors/sync-connectors';
import { DataTable, RowDataWithActions } from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { oauthAppsQueries } from '@/features/connections';
import {
  InstallConnectorDialog,
  ConnectorIcon,
  connectorsApi,
  connectorsHooks,
} from '@/features/connectors';
import { api } from '@/lib/api';

type TabValue = 'connectors' | 'connector-sets';

const ConnectorsListTab = () => {
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('name') ?? '';
  const {
    connectors,
    refetch: refetchConnectors,
    isLoading,
  } = connectorsHooks.useConnectors({
    searchQuery,
    includeHidden: true,
    isTableQuery: true,
  });

  const { refetch: refetchConnectorsOAuth2AppsMap } =
    oauthAppsQueries.useConnectorsOAuth2AppsMap();

  const columns: ColumnDef<
    RowDataWithActions<ConnectorMetadataModelSummary>
  >[] = useMemo(
    () => [
      {
        accessorKey: 'displayName',
        size: 300,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Name')}
            icon={Puzzle}
          />
        ),
        cell: ({ row }) => {
          return (
            <div className="flex items-center gap-2">
              <ConnectorIcon
                size={'sm'}
                border={true}
                displayName={row.original.displayName}
                logoUrl={row.original.logoUrl}
                showTooltip={false}
              />
              <div className="flex flex-col gap-0.5">
                <span>{row.original.displayName}</span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'packageName',
        size: 250,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Package Name')}
            icon={Hash}
          />
        ),
        cell: ({ row }) => {
          return <div className="text-left">{row.original.name}</div>;
        },
      },
      {
        accessorKey: 'version',
        size: 80,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Version')}
            icon={GitBranch}
          />
        ),
        cell: ({ row }) => {
          return <div className="text-left">{row.original.version}</div>;
        },
      },
      {
        id: 'actions',
        size: 190,
        cell: ({ row }) => {
          return (
            <div className="flex justify-end">
              <ConnectorActions connectorName={row.original.name} />
              {row.original.connectorType === ConnectorType.CUSTOM && (
                <ConfirmationDeleteDialog
                  title={t('Delete {name}', { name: row.original.name })}
                  entityName={t('Connector')}
                  message={t(
                    'This will permanently delete this connector, all steps using it will fail.',
                  )}
                  mutationFn={async () => {
                    await connectorsApi.delete(row.original.id!);
                    await refetchConnectors();
                  }}
                  onError={(error) => {
                    if (api.isError(error)) {
                      const applicationError = error.response
                        ?.data as ApplicationErrorParams;
                      if (applicationError?.code === ErrorCode.VALIDATION) {
                        toast.error(applicationError.params.message);
                        return;
                      }
                    }
                    toast.error(t('Failed to delete connector'));
                  }}
                >
                  <Button variant="ghost" size={'sm'}>
                    <Trash className="size-4 text-destructive" />
                  </Button>
                </ConfirmationDeleteDialog>
              )}
            </div>
          );
        },
      },
    ],
    [refetchConnectors, refetchConnectorsOAuth2AppsMap],
  );

  return (
    <DataTable
      emptyStateTextTitle={t('No connectors found')}
      emptyStateTextDescription={t(
        'Start by installing connectors that you want to use in your automations',
      )}
      emptyStateIcon={<Package className="size-14" />}
      columns={columns}
      filters={[
        {
          type: 'input',
          title: t('Connector Name'),
          accessorKey: 'name',
          icon: CheckIcon,
        },
      ]}
      page={{
        data: connectors ?? [],
        next: null,
        previous: null,
      }}
      isLoading={isLoading}
      toolbarButtons={[
        <CustomizeSelectorDialog key="customize" />,
        <SyncConnectorsButton key="sync" />,
        <InstallConnectorDialog
          key="install"
          onInstallConnector={() => refetchConnectors()}
          scope={ConnectorScope.TENANT}
        />,
      ]}
      virtualizeRows={true}
      hidePagination={true}
    />
  );
};

const TenantConnectorsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabValue) || 'connectors';

  const setTab = (tab: TabValue) => {
    const newParams = new URLSearchParams(searchParams);
    if (tab === 'connectors') {
      newParams.delete('tab');
    } else {
      newParams.set('tab', tab);
    }
    setSearchParams(newParams, { replace: true });
  };

  return (
    <>
      <DashboardPageHeader
        description={t(
          'Manage the connectors that are available to your users',
        )}
        title={t('Connectors')}
      />
      <div className="mx-auto w-full flex flex-col flex-1 min-h-0">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setTab(v as TabValue)}
          className="flex flex-col flex-1 min-h-0 min-w-0"
        >
          <TabsList
            variant="outline"
            className="border-b w-full rounded-none justify-start shrink-0"
          >
            <TabsTrigger variant="outline" value="connectors">
              <Puzzle className="size-4 mr-2" />
              {t('Connectors')}
            </TabsTrigger>
            <TabsTrigger variant="outline" value="connector-sets">
              <Layers className="size-4 mr-2" />
              {t('Connector Sets')}
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="connectors"
            className="flex-1 min-h-0 flex flex-col mt-0 min-w-0"
          >
            <ConnectorsListTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

TenantConnectorsPage.displayName = 'TenantConnectorsPage';
export { TenantConnectorsPage };
