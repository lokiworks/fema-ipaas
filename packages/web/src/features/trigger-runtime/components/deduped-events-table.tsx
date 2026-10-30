import { isNil } from '@fema-ipaas/core-utils';
import {
  DedupedEventWithWorkflow,
  ExecutionStatus,
  isFailedState,
} from '@fema-ipaas/shared';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import { CopyX, ExternalLink, Settings2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  CURSOR_QUERY_PARAM,
  DataTable,
  LIMIT_QUERY_PARAM,
  RowDataWithActions,
} from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { FormattedDate } from '@/components/custom/formatted-date';
import { MessageTooltip } from '@/components/custom/message-tooltip';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { executionUtils } from '@/features/executions';
import { authenticationSession } from '@/lib/authentication-session';

import { triggerRuntimeHooks } from '../hooks/trigger-runtime-hooks';

export function DedupedEventsTable() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<DedupedEventWithWorkflow | null>(
    null,
  );
  const projectId = authenticationSession.getProjectId() ?? '';
  const limit = Number(searchParams.get(LIMIT_QUERY_PARAM) ?? DEFAULT_LIMIT);
  const { data, isLoading, isError } = triggerRuntimeHooks.useDedupedEvents({
    projectId,
    workflowId: searchParams.get('workflowId') ?? undefined,
    cursor: searchParams.get(CURSOR_QUERY_PARAM) ?? undefined,
    limit: Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
  });
  const openRun = (runId: string) =>
    navigate(authenticationSession.appendProjectRoutePrefix(`/runs/${runId}`));
  const openWorkflow = (workflowId: string) =>
    navigate(
      authenticationSession.appendProjectRoutePrefix(
        `/workflows/${workflowId}`,
      ),
    );

  return (
    <>
      <DataTable
        emptyStateTextTitle={t('No deduplicated events')}
        emptyStateTextDescription={t(
          'Events skipped by trigger dedupe show up here with the run that handled the first one.',
        )}
        emptyStateIcon={<CopyX className="size-14" />}
        columns={dedupedEventColumns({ onOpenRun: openRun })}
        page={data}
        isLoading={isLoading}
        isError={isError}
        onRowClick={(row) => setSelected(row)}
      />
      <DedupedEventDialog
        event={selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
        onOpenRun={openRun}
        onOpenWorkflow={openWorkflow}
      />
    </>
  );
}

function DedupedEventDialog({
  event,
  onOpenChange,
  onOpenRun,
  onOpenWorkflow,
}: {
  event: DedupedEventWithWorkflow | null;
  onOpenChange: (open: boolean) => void;
  onOpenRun: (runId: string) => void;
  onOpenWorkflow: (workflowId: string) => void;
}) {
  return (
    <Dialog open={event !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {event !== null && (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('This trigger was deduplicated and did not run')}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'The dedupe key {keyPath} had the value {value}, the same as an earlier event. Within {window} the same key is processed only once, so no step ran and no duplicate data was created.',
                  {
                    keyPath: event.keyPath,
                    value: event.keyPreview,
                    window: windowLabel(event.windowSeconds),
                  },
                )}
              </DialogDescription>
            </DialogHeader>
            {firstRunFailed(event.firstExecutionStatus) && (
              <Alert variant="warning" data-testid="deduped-first-run-failed">
                <TriangleAlert className="size-4" />
                <AlertDescription>
                  {t(
                    'The first run failed, so this event has not been processed yet. Retry the first run, or ask the sender to resend it: while the first run is failed, a resent event starts a new run instead of being deduplicated.',
                  )}
                </AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenWorkflow(event.workflowId)}
              >
                <Settings2 className="size-4" />
                {t('Dedupe settings')}
              </Button>
              <MessageTooltip
                isDisabled={isNil(event.firstExecutionId)}
                message={t(
                  'The first run is unknown because it was handled before this record started or while it was still being queued.',
                )}
              >
                <Button
                  type="button"
                  disabled={isNil(event.firstExecutionId)}
                  onClick={() => {
                    if (!isNil(event.firstExecutionId)) {
                      onOpenRun(event.firstExecutionId);
                    }
                  }}
                >
                  <ExternalLink className="size-4" />
                  {t('View the first run')}
                </Button>
              </MessageTooltip>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function dedupedEventColumns({
  onOpenRun,
}: {
  onOpenRun: (runId: string) => void;
}): ColumnDef<RowDataWithActions<DedupedEventWithWorkflow>>[] {
  return [
    {
      accessorKey: 'created',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Received')} />
      ),
      cell: ({ row }) => (
        <FormattedDate date={new Date(row.original.created)} includeTime />
      ),
    },
    {
      accessorKey: 'workflowDisplayName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Workflow')} />
      ),
      cell: ({ row }) => {
        const name = row.original.workflowDisplayName ?? t('Deleted workflow');
        return (
          <TextWithTooltip tooltipMessage={name}>
            <p className="max-w-[240px] truncate">{name}</p>
          </TextWithTooltip>
        );
      },
    },
    {
      accessorKey: 'keyPreview',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Dedupe key')} />
      ),
      cell: ({ row }) => (
        <TextWithTooltip tooltipMessage={row.original.keyPreview}>
          <p className="max-w-[240px] truncate font-mono text-xs">
            {row.original.keyPreview}
          </p>
        </TextWithTooltip>
      ),
    },
    {
      accessorKey: 'windowSeconds',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Window')} />
      ),
      cell: ({ row }) => windowLabel(row.original.windowSeconds),
    },
    {
      accessorKey: 'firstExecutionStatus',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('First run status')} />
      ),
      cell: ({ row }) => (
        <FirstRunStatus status={row.original.firstExecutionStatus} />
      ),
    },
    {
      accessorKey: 'firstExecutionId',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('First run')} />
      ),
      cell: ({ row }) => {
        const runId = row.original.firstExecutionId;
        if (isNil(runId)) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              onOpenRun(runId);
            }}
          >
            {t('View the first run')}
          </Button>
        );
      },
    },
  ];
}

function FirstRunStatus({ status }: { status?: ExecutionStatus | null }) {
  if (isNil(status)) {
    return <span className="text-muted-foreground">-</span>;
  }
  const failed = firstRunFailed(status);
  const label = executionUtils.getStatusLabel(status);
  if (!failed) {
    return <span>{label}</span>;
  }
  return (
    <MessageTooltip
      isDisabled
      message={t(
        'The first run failed, so this event has not been processed yet. Retry the first run to process it.',
      )}
    >
      <span
        className="inline-flex items-center gap-1 text-destructive-700 dark:text-destructive-200"
        data-testid="deduped-first-run-failed-cell"
      >
        <TriangleAlert className="size-3.5" />
        {t('{status}, not processed', { status: label })}
      </span>
    </MessageTooltip>
  );
}

function firstRunFailed(status?: ExecutionStatus | null): boolean {
  return !isNil(status) && isFailedState(status);
}

function windowLabel(seconds: number): string {
  if (seconds % DAY === 0) {
    return t('{count} days', { count: seconds / DAY });
  }
  if (seconds % HOUR === 0) {
    return t('{count} hours', { count: seconds / HOUR });
  }
  return t('{count} minutes', { count: Math.round(seconds / 60) });
}

const DEFAULT_LIMIT = 10;
const HOUR = 60 * 60;
const DAY = 24 * HOUR;
