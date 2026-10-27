import { ProjectWithLimits, ProjectType } from '@fema-ipaas/shared';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import { Lock, User } from 'lucide-react';

import { RowDataWithActions } from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { FormattedDate } from '@/components/custom/formatted-date';

export const projectsTableColumns = (): ColumnDef<
  RowDataWithActions<ProjectWithLimits & { globalConnectionsCount: number }>
>[] => {
  const columns: ColumnDef<
    RowDataWithActions<ProjectWithLimits & { globalConnectionsCount: number }>
  >[] = [
    {
      accessorKey: 'displayName',
      size: 170,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Name')} />
      ),
      cell: ({ row }) => {
        const locked = false;
        const isPersonal = row.original.type === ProjectType.PERSONAL;

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
      accessorKey: 'members',
      size: 70,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Members')}
          className="w-full"
        />
      ),
      cell: ({ row }) => {
        return (
          <div className="text-left tabular-nums font-medium">
            {row.original.analytics.members}
          </div>
        );
      },
    },
    {
      accessorKey: 'workflows',
      size: 110,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Active Workflows')}
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
    size: 100,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={t('Global Connections')}
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
    size: 90,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={t('Created')}
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
