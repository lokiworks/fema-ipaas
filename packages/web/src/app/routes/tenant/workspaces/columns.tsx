import { WorkspaceWithLimits, WorkspaceType } from '@fema-ipaas/shared';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import { Lock, User, Tag, Users, Workflow, Clock, Link2 } from 'lucide-react';

import { RowDataWithActions } from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { FormattedDate } from '@/components/custom/formatted-date';

export const workspacesTableColumns = (): ColumnDef<
  RowDataWithActions<WorkspaceWithLimits & { globalConnectionsCount: number }>
>[] => {
  const columns: ColumnDef<
    RowDataWithActions<WorkspaceWithLimits & { globalConnectionsCount: number }>
  >[] = [
    {
      accessorKey: 'displayName',
      size: 270,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Name')} icon={Tag} />
      ),
      cell: ({ row }) => {
        const locked = false;
        const isPersonal = row.original.type === WorkspaceType.PERSONAL;

        return (
          <div className="text-left flex items-center justify-start ">
            {locked && <Lock className="size-3 mr-1.5" strokeWidth={2.5} />}
            {isPersonal && <User className="size-4 mr-1.5"></User>}
            <span className="font-medium">{row.original.displayName}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'type',
      enableHiding: true,
    },
    {
      accessorKey: 'users',
      size: 120,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Active Users')}
          icon={Users}
          className="w-full"
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="text-left tabular-nums">
            <span className="font-medium">
              {row.original.analytics.activeWorkflows}
            </span>
            <span className="text-muted-foreground">
              {` / ${row.original.analytics.totalWorkflows}`}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'workflows',
      size: 120,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Active Workflows')}
          icon={Workflow}
          className="w-full"
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="text-left tabular-nums">
            <span className="font-medium">
              {row.original.analytics.activeWorkflows}
            </span>
            <span className="text-muted-foreground">
              {` / ${row.original.analytics.totalWorkflows}`}
            </span>
          </div>
        );
      },
    },
  ];

  columns.push({
    accessorKey: 'globalConnectionsCount',
    size: 135,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={t('Global Connections')}
        icon={Link2}
        className="w-full"
      />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-left tabular-nums">
          {row.original.globalConnectionsCount}
        </div>
      );
    },
  });

  columns.push({
    accessorKey: 'createdAt',
    size: 110,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={t('Created')}
        icon={Clock}
      />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-left">
          <FormattedDate date={new Date(row.original.created)} />
        </div>
      );
    },
  });

  return columns;
};
