import { ApplicationEvent } from '@fema-ipaas/shared';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import { Filter, ScrollText } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { DataTable, RowDataWithActions } from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { FormattedDate } from '@/components/custom/formatted-date';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import {
  AUDIT_EVENT_SOURCE,
  auditEventsHooks,
  auditEventUtils,
} from '@/features/audit-events';

export default function AuditLogPage() {
  const [searchParams] = useSearchParams();
  const sources = searchParams.getAll('source');
  const action = useMemo(
    () => auditEventUtils.actionsForSources(sources),
    [sources.join(',')],
  );
  const { data, isLoading, isError } = auditEventsHooks.useAuditEvents({
    action,
  });

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
          <span className="text-sm">
            {auditEventUtils.actionLabel(row.original.action)}
          </span>
        ),
      },
      {
        accessorKey: 'data',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Details')} />
        ),
        cell: ({ row }) => {
          const summary = auditEventUtils.summarize(row.original);
          return (
            <div className="min-w-0 max-w-[min(52vw,640px)]">
              <TextWithTooltip tooltipMessage={summary}>
                <p className="truncate text-sm text-muted-foreground">
                  {summary}
                </p>
              </TextWithTooltip>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('Audit Log')}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'Who changed what, and what the system executed. Filter by source to keep them apart.',
          )}
        </p>
      </div>
      <DataTable
        emptyStateTextTitle={t('No audit events yet')}
        emptyStateTextDescription={t(
          'Changes to workflows, connections and members will appear here.',
        )}
        emptyStateIcon={<ScrollText className="size-14" />}
        columns={columns}
        filters={[
          {
            type: 'select',
            title: t('Source'),
            accessorKey: 'source',
            icon: Filter,
            options: [
              { label: t('People'), value: AUDIT_EVENT_SOURCE.HUMAN },
              { label: t('System'), value: AUDIT_EVENT_SOURCE.SYSTEM },
            ],
          },
        ]}
        page={data}
        isLoading={isLoading}
        isError={isError}
      />
    </div>
  );
}
