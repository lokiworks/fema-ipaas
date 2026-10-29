import { ProjectType } from '@fema-ipaas/shared';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import { User } from 'lucide-react';

import { RowDataWithActions } from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { FormattedDate } from '@/components/custom/formatted-date';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { LimitUsageBar } from '@/features/limits';

import { TenantProjectRow } from './tenant-project-row';

export const projectsTableColumns = ({
  compact,
}: {
  compact: boolean;
}): ColumnDef<RowDataWithActions<TenantProjectRow>>[] => {
  const name: ColumnDef<RowDataWithActions<TenantProjectRow>> = {
    accessorKey: 'displayName',
    size: compact ? 120 : 170,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('Name')} />
    ),
    cell: ({ row }) => {
      const isPersonal = row.original.type === ProjectType.PERSONAL;
      return (
        <div className="flex min-w-0 items-center justify-start gap-1.5 text-left">
          {isPersonal && <User className="size-4 shrink-0" />}
          <TextWithTooltip tooltipMessage={row.original.displayName}>
            <span className="truncate font-medium">
              {row.original.displayName}
            </span>
          </TextWithTooltip>
        </div>
      );
    },
  };
  const type: ColumnDef<RowDataWithActions<TenantProjectRow>> = {
    accessorKey: 'type',
    enableHiding: true,
  };
  const workflows: ColumnDef<RowDataWithActions<TenantProjectRow>> = {
    accessorKey: 'workflows',
    size: compact ? 130 : 170,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={t('Workflows')}
        className="w-full"
      />
    ),
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-1">
        {row.original.limits ? (
          <LimitCell
            used={row.original.limits.workflows.used}
            limit={row.original.limits.workflows.limit}
            inherited={row.original.limits.workflows.override === null}
          />
        ) : (
          <span className="tabular-nums">
            {row.original.analytics.totalWorkflows}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {t('{count} enabled', {
            count: row.original.analytics.activeWorkflows,
          })}
        </span>
      </div>
    ),
  };
  if (compact) {
    return [name, type, workflows];
  }
  return [
    name,
    type,
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
      cell: ({ row }) => (
        <div className="text-left tabular-nums font-medium">
          {row.original.analytics.members}
        </div>
      ),
    },
    workflows,
    {
      accessorKey: 'monthlyRuns',
      size: 190,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Runs this month')}
          className="w-full"
        />
      ),
      cell: ({ row }) =>
        row.original.limits ? (
          <LimitCell
            used={row.original.limits.monthlyRuns.used}
            limit={row.original.limits.monthlyRuns.limit}
            inherited={row.original.limits.monthlyRuns.override === null}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: 'globalConnectionsCount',
      size: 90,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Global Connections')}
          className="w-full"
        />
      ),
      cell: ({ row }) => (
        <div className="text-left tabular-nums">
          {row.original.globalConnectionsCount}
        </div>
      ),
    },
    {
      accessorKey: 'createdAt',
      size: 90,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Created')} />
      ),
      cell: ({ row }) => (
        <div className="text-left">
          <FormattedDate date={new Date(row.original.created)} />
        </div>
      ),
    },
  ];
};

function LimitCell({
  used,
  limit,
  inherited,
}: {
  used: number;
  limit: number | null;
  inherited: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <LimitUsageBar
        used={used}
        limit={limit}
        className="flex-wrap gap-x-2 gap-y-0.5"
      />
      {inherited && (
        <Badge variant="outline" className="shrink-0 text-xs font-normal">
          {t('Instance limit')}
        </Badge>
      )}
    </div>
  );
}
