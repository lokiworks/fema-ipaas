import { NetworkAgent, NetworkAgentStatus } from '@fema-ipaas/shared';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import { Clock, Globe, Network, Power, Trash } from 'lucide-react';

import { DashboardPageHeader } from '@/app/components/dashboard-page-header';
import { DataTable, RowDataWithActions } from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import { StatusIconWithText } from '@/components/custom/status-icon-with-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { networkAgentsHooks } from '@/features/network-agents';

import { CreateAgentDialog } from './create-agent-dialog';

const statusVariant = (status: NetworkAgentStatus) => {
  switch (status) {
    case NetworkAgentStatus.ONLINE:
      return 'success' as const;
    case NetworkAgentStatus.OFFLINE:
      return 'error' as const;
    case NetworkAgentStatus.DISABLED:
      return 'default' as const;
    case NetworkAgentStatus.PENDING:
      return 'default' as const;
  }
};

const allowlistSummary = (agent: NetworkAgent) => {
  const entries = [...agent.hostAllowlist, ...agent.cidrAllowlist];
  if (entries.length === 0) {
    return t('Nothing allowed yet');
  }
  return entries.join(', ');
};

export default function NetworkAgentsPage() {
  const { data: agents, isLoading } = networkAgentsHooks.useNetworkAgents();
  const { mutate: updateAgent } = networkAgentsHooks.useUpdateNetworkAgent();
  const { mutate: deleteAgent } = networkAgentsHooks.useDeleteNetworkAgent();

  const columns: ColumnDef<RowDataWithActions<NetworkAgent>, unknown>[] = [
    {
      accessorKey: 'displayName',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Name')}
          icon={Network}
        />
      ),
      cell: ({ row }) => (
        <div className="text-left font-medium">{row.original.displayName}</div>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Status')}
          icon={Power}
        />
      ),
      cell: ({ row }) => (
        <StatusIconWithText
          icon={Power}
          text={row.original.status}
          variant={statusVariant(row.original.status)}
        />
      ),
    },
    {
      accessorKey: 'hostAllowlist',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Allowlist')}
          icon={Globe}
        />
      ),
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono text-xs">
          {allowlistSummary(row.original)}
        </Badge>
      ),
    },
    {
      accessorKey: 'lastSeenAt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Last seen')}
          icon={Clock}
        />
      ),
      cell: ({ row }) =>
        row.original.lastSeenAt ? (
          <FormattedDate date={new Date(row.original.lastSeenAt)} />
        ) : (
          <span className="text-muted-foreground">{t('Never')}</span>
        ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              updateAgent({
                id: row.original.id,
                request: {
                  status:
                    row.original.status === NetworkAgentStatus.DISABLED
                      ? NetworkAgentStatus.PENDING
                      : NetworkAgentStatus.DISABLED,
                },
              })
            }
          >
            {row.original.status === NetworkAgentStatus.DISABLED
              ? t('Enable')
              : t('Disable')}
          </Button>
          <ConfirmationDeleteDialog
            title={`${t('Delete')} ${row.original.displayName}`}
            message={t(
              'Connections bound to this agent will stop reaching their systems.',
            )}
            mutationFn={async () => deleteAgent(row.original.id)}
            entityName={t('network agent')}
          >
            <Button variant="ghost" size="sm">
              <Trash className="size-4" />
            </Button>
          </ConfirmationDeleteDialog>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <DashboardPageHeader
        title={t('Network Agents')}
        description={t(
          'An agent runs inside your network and gives the platform a way to reach systems it cannot call directly.',
        )}
      >
        <CreateAgentDialog />
      </DashboardPageHeader>
      <DataTable
        columns={columns}
        page={agents}
        isLoading={isLoading}
        hidePagination={true}
        emptyStateTextTitle={t('No network agents')}
        emptyStateTextDescription={t(
          'Create an agent to reach systems that are not exposed to the platform.',
        )}
        emptyStateIcon={<Network className="size-14" />}
      />
    </div>
  );
}
