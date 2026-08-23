import {
  ApplicationEvent,
  summarizeApplicationEvent,
} from '@fema-ipaas/shared';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import { ScrollText } from 'lucide-react';
import { useMemo } from 'react';

import { DataTable, RowDataWithActions } from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { FormattedDate } from '@/components/custom/formatted-date';
import { auditEventsHooks } from '@/features/audit-events';

export default function AuditLogPage() {
  const { data, isLoading } = auditEventsHooks.useAuditEvents();

  const columns = useMemo<
    ColumnDef<RowDataWithActions<ApplicationEvent>, unknown>[]
  >(
    () => [
      {
        accessorKey: 'created',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Time')} />
        ),
        cell: ({ row }) => (
          <FormattedDate date={new Date(row.original.created)} />
        ),
      },
      {
        accessorKey: 'userEmail',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Actor')} />
        ),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.userEmail ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'action',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Action')} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.action}</span>
        ),
      },
      {
        accessorKey: 'data',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Details')} />
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {summarizeApplicationEvent(row.original)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('Audit Log')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('Who changed what, kept separate from what the system executed.')}
        </p>
      </div>
      <DataTable
        emptyStateTextTitle={t('No audit events yet')}
        emptyStateTextDescription={t(
          'Changes to workflows, connections and members will appear here.',
        )}
        emptyStateIcon={<ScrollText className="size-14" />}
        columns={columns}
        page={data}
        isLoading={isLoading}
      />
    </div>
  );
}
