import { isNil, SeekPage } from '@fema-ipaas/core-utils';
import {
  RunEnvironment,
  RunLogRow,
  RunLogType,
  RunRerunBlockReason,
  WorkflowRetryStrategy,
} from '@fema-ipaas/shared';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import { ChevronDown, RotateCcw, ScrollText } from 'lucide-react';

import {
  BulkAction,
  DataTable,
  RowDataWithActions,
} from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { FormattedDate } from '@/components/custom/formatted-date';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatUtils } from '@/lib/format-utils';

import { runLogUiUtils } from '../utils/run-log-ui-utils';

import { RunStatus } from './run-status';

export function RunLogsTable({
  page,
  isLoading,
  isError,
  onOpenRun,
  onRerun,
}: {
  page: SeekPage<RunLogRow> | undefined;
  isLoading: boolean;
  isError: boolean;
  onOpenRun: (runId: string) => void;
  onRerun: (request: {
    rows: RunLogRow[];
    strategy: WorkflowRetryStrategy;
  }) => void;
}) {
  const bulkActions: BulkAction<RunLogRow>[] = [
    {
      render: (selectedRows, resetSelection) => (
        <BulkRerun
          rows={selectedRows}
          onRerun={(strategy) => {
            onRerun({ rows: selectedRows, strategy });
            resetSelection();
          }}
        />
      ),
    },
  ];
  return (
    <DataTable
      emptyStateTextTitle={t('No logs match these conditions')}
      emptyStateTextDescription={t(
        'Try a longer time range or remove some of the conditions.',
      )}
      emptyStateIcon={<ScrollText className="size-14" />}
      columns={columns({ onOpenRun, onRerun })}
      page={page}
      isLoading={isLoading}
      isError={isError}
      selectColumn
      bulkActions={bulkActions}
      onRowClick={(row) => onOpenRun(row.id)}
    />
  );
}

function BulkRerun({
  rows,
  onRerun,
}: {
  rows: RunLogRow[];
  onRerun: (strategy: WorkflowRetryStrategy) => void;
}) {
  const rerunnable = rows.filter((row) => isNil(row.rerunBlockReason));
  const disabled = rerunnable.length === 0;
  return (
    <div
      className="flex items-center gap-3"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-xs text-muted-foreground">
        {disabled
          ? t('None of the selected logs can be rerun')
          : t(
              '{count, plural, =1 {1 selected log can be rerun} other {# selected logs can be rerun}}',
              { count: rerunnable.length },
            )}
      </span>
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <DropdownMenuTrigger asChild disabled={disabled}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                >
                  <RotateCcw className="size-4" />
                  {t('Batch rerun')}
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
            </span>
          </TooltipTrigger>
          {disabled && (
            <TooltipContent>
              {t(
                'Only failed or timed out production runs you can edit can be rerun',
              )}
            </TooltipContent>
          )}
        </Tooltip>
        <DropdownMenuContent>
          <DropdownMenuItem
            onSelect={() => onRerun(WorkflowRetryStrategy.FROM_FAILED_STEP)}
          >
            {t('Rerun from the failed step')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onRerun(WorkflowRetryStrategy.ON_LATEST_VERSION)}
          >
            {t('Rerun the whole run')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function columns({
  onOpenRun,
  onRerun,
}: {
  onOpenRun: (runId: string) => void;
  onRerun: (request: {
    rows: RunLogRow[];
    strategy: WorkflowRetryStrategy;
  }) => void;
}): ColumnDef<RowDataWithActions<RunLogRow>, unknown>[] {
  return [
    {
      accessorKey: 'created',
      size: 150,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Created')} />
      ),
      cell: ({ row }) => (
        <FormattedDate
          date={new Date(row.original.created)}
          includeTime
          className="text-sm"
        />
      ),
    },
    {
      accessorKey: 'workflowDisplayName',
      size: 220,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Workflow')} />
      ),
      cell: ({ row }) => {
        const name = row.original.workflowExists
          ? row.original.workflowDisplayName ?? row.original.workflowId
          : t('Deleted workflow');
        return (
          <div className="min-w-0">
            <TextWithTooltip tooltipMessage={name}>
              <p className="truncate text-sm font-medium">{name}</p>
            </TextWithTooltip>
          </div>
        );
      },
    },
    {
      accessorKey: 'businessKey',
      size: 150,
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Business key')} />
      ),
      cell: ({ row }) =>
        isNil(row.original.businessKey) ? (
          <span className="text-sm text-muted-foreground">-</span>
        ) : (
          <TextWithTooltip tooltipMessage={row.original.businessKey}>
            <p className="truncate font-mono text-xs">
              {row.original.businessKey}
            </p>
          </TextWithTooltip>
        ),
    },
    {
      accessorKey: 'projectDisplayName',
      size: 140,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Project')} />
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <TextWithTooltip tooltipMessage={row.original.projectDisplayName}>
            <p className="truncate text-sm">
              {row.original.projectDisplayName}
            </p>
          </TextWithTooltip>
        </div>
      ),
    },
    {
      accessorKey: 'environment',
      size: 80,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Environment')} />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.environment === RunEnvironment.PRODUCTION
            ? t('Production')
            : t('Test')}
        </span>
      ),
    },
    {
      accessorKey: 'type',
      size: 130,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Type')} />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm">
          {row.original.type === RunLogType.DEBUG
            ? t('Debug log')
            : t('Run log')}
          {isRerun(row.original) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="info" className="gap-1 px-1.5">
                  <RotateCcw className="size-3" />
                  {t('Rerun')}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{rerunTagTooltip(row.original)}</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'versionNumber',
      size: 70,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Version')} />
      ),
      cell: ({ row }) =>
        row.original.type === RunLogType.DEBUG ? (
          <span className="text-sm text-muted-foreground">{t('Draft')}</span>
        ) : (
          <span className="text-sm">
            {isNil(row.original.versionNumber)
              ? '-'
              : `v${row.original.versionNumber}`}
          </span>
        ),
    },
    {
      accessorKey: 'status',
      size: 130,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Status')} />
      ),
      cell: ({ row }) => <RunStatus status={row.original.status} />,
    },
    {
      accessorKey: 'durationMs',
      size: 90,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Duration')} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {isNil(row.original.durationMs)
            ? '-'
            : formatUtils.formatDuration(row.original.durationMs, true)}
        </span>
      ),
    },
    {
      accessorKey: 'errorCount',
      size: 70,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Errors')} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.errorCount}</span>
      ),
    },
    {
      accessorKey: 'actions',
      size: 130,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Actions')} />
      ),
      cell: ({ row }) => (
        <div
          className="flex items-center gap-3 text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => onOpenRun(row.original.id)}
          >
            {t('Details')}
          </Button>
          <RowRerun
            row={row.original}
            onRerun={() =>
              onRerun({
                rows: [row.original],
                strategy: isNil(row.original.fromFailedStepBlockReason)
                  ? WorkflowRetryStrategy.FROM_FAILED_STEP
                  : WorkflowRetryStrategy.ON_LATEST_VERSION,
              })
            }
          />
        </div>
      ),
    },
  ];
}

function RowRerun({ row, onRerun }: { row: RunLogRow; onRerun: () => void }) {
  if (row.rerunBlockReason === RunRerunBlockReason.NOT_FAILED) {
    return null;
  }
  if (isNil(row.rerunBlockReason)) {
    return (
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0"
        onClick={onRerun}
      >
        {t('Rerun')}
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-disabled="true"
          className="cursor-not-allowed text-muted-foreground"
        >
          {t('Rerun')}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {runLogUiUtils.blockReasonLabel(row.rerunBlockReason)}
      </TooltipContent>
    </Tooltip>
  );
}

function isRerun(row: RunLogRow): boolean {
  return !isNil(row.rerunOfExecutionId) || row.inPlaceRetryCount > 0;
}

function rerunTagTooltip(row: RunLogRow): string {
  if (!isNil(row.rerunOfExecutionId)) {
    return t('Created by rerunning the whole run of an earlier log');
  }
  return t(
    '{count, plural, =1 {Rerun from the failed step once} other {Rerun from the failed step # times}}',
    { count: row.inPlaceRetryCount },
  );
}
