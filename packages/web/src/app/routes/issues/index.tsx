import { Permission } from '@fema-ipaas/core-utils';
import {
  IssueKind,
  IssueListView,
  IssueSeverity,
  IssueSort,
  IssueStatus,
  IssueWithSeverity,
} from '@fema-ipaas/shared';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import {
  BellOff,
  CheckCircle2,
  CircleAlert,
  EyeOff,
  Link2,
  Search,
  Siren,
  UserCheck,
  Workflow,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  BulkAction,
  CURSOR_QUERY_PARAM,
  DataTable,
  DataTableFilters,
  LIMIT_QUERY_PARAM,
  RowDataWithActions,
} from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { FormattedDate } from '@/components/custom/formatted-date';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  IssueSeverityBadge,
  IssueStatusBadge,
  issueMembersHooks,
  issuesHooks,
  issueUiUtils,
} from '@/features/issues';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

function IssuesPage() {
  const projectId = authenticationSession.getProjectId()!;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { checkAccess } = useAuthorization();
  const canWrite = checkAccess(Permission.WRITE_ISSUE);
  const { assignable, nameOf } = issueMembersHooks.useIssueMembers();
  const [selectedRows, setSelectedRows] = useState<IssueWithSeverity[]>([]);

  const view = readEnum({
    value: searchParams.get('view'),
    values: Object.values(IssueListView),
    fallback: IssueListView.UNRESOLVED,
  });
  const severity = readEnum({
    value: searchParams.get('severity'),
    values: Object.values(IssueSeverity),
    fallback: undefined,
  });
  const sort = readEnum({
    value: searchParams.get('sort'),
    values: Object.values(IssueSort),
    fallback: IssueSort.LAST_SEEN,
  });
  const request = {
    projectId,
    view,
    severity,
    sort,
    assignee: searchParams.get('assignee') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    cursor: searchParams.get(CURSOR_QUERY_PARAM) ?? undefined,
    limit: Number(searchParams.get(LIMIT_QUERY_PARAM) ?? DEFAULT_LIMIT),
  };
  const { data: page, isLoading, isError } = issuesHooks.useIssues(request);
  const { data: summary } = issuesHooks.useSummary(projectId);
  const { mutate: batchUpdate } = issuesHooks.useBatchUpdate();

  const setView = (next: IssueListView) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('view', next);
      params.delete(CURSOR_QUERY_PARAM);
      return params;
    });
  };

  const filters: DataTableFilters<
    'view' | 'severity' | 'assignee' | 'search' | 'sort'
  >[] = [
    { type: 'input', title: t('Search'), accessorKey: 'search', icon: Search },
    {
      type: 'select',
      title: t('Status'),
      accessorKey: 'view',
      single: true,
      options: VIEW_ORDER.map((value) => ({ value, label: viewLabel(value) })),
    },
    {
      type: 'select',
      title: t('Severity'),
      accessorKey: 'severity',
      single: true,
      options: Object.values(IssueSeverity).map((value) => ({
        value,
        label: issueUiUtils.severityLabel(value),
      })),
    },
    {
      type: 'select',
      title: t('Assignee'),
      accessorKey: 'assignee',
      single: true,
      options: [
        { value: 'me', label: t('Assigned to me') },
        { value: 'unassigned', label: t('Unassigned') },
        ...assignable.map((member) => ({
          value: member.id,
          label: member.name,
        })),
      ],
    },
    {
      type: 'select',
      title: t('Sort by'),
      accessorKey: 'sort',
      single: true,
      options: [
        { value: IssueSort.LAST_SEEN, label: t('Last seen') },
        { value: IssueSort.OCCURRENCES, label: t('Failure count') },
        { value: IssueSort.SEVERITY, label: t('Severity') },
      ],
    },
  ];

  const columns: ColumnDef<RowDataWithActions<IssueWithSeverity>, unknown>[] =
    useMemo(
      () => [
        {
          accessorKey: 'title',
          size: 380,
          header: ({ column }) => (
            <DataTableColumnHeader
              column={column}
              title={t('Issue')}
              icon={Siren}
            />
          ),
          cell: ({ row }) => (
            <div className="flex items-start gap-2 min-w-0">
              <div className="shrink-0 mt-0.5 text-muted-foreground">
                {row.original.kind === IssueKind.CONNECTION ? (
                  <Link2 className="size-4" />
                ) : (
                  <Workflow className="size-4" />
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">
                  {issueUiUtils.issueTitle(row.original)}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {row.original.kind === IssueKind.CONNECTION
                    ? t('Connection issue')
                    : [
                        row.original.workflowDisplayName,
                        row.original.stepDisplayName,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                  {row.original.errorCode ? ` · ${row.original.errorCode}` : ''}
                </span>
              </div>
            </div>
          ),
        },
        {
          accessorKey: 'occurrences',
          size: 150,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title={t('Impact')} />
          ),
          cell: ({ row }) => (
            <div className="text-sm">
              {t('{runs} runs · {workflows} workflows', {
                runs: row.original.occurrences,
                workflows: row.original.affectedWorkflows,
              })}
            </div>
          ),
        },
        {
          accessorKey: 'lastSeenAt',
          size: 160,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title={t('Last seen')} />
          ),
          cell: ({ row }) => (
            <div className="flex flex-col text-sm">
              <FormattedDate date={new Date(row.original.lastSeenAt)} />
              <span className="text-xs text-muted-foreground">
                {t('First seen')}{' '}
                <FormattedDate date={new Date(row.original.firstSeenAt)} />
              </span>
            </div>
          ),
        },
        {
          accessorKey: 'status',
          size: 150,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title={t('Status')} />
          ),
          cell: ({ row }) => (
            <IssueStatusBadge
              status={row.original.status}
              reopened={row.original.reopened}
              muted={isMuted(row.original.mutedUntil)}
            />
          ),
        },
        {
          accessorKey: 'assigneeId',
          size: 120,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title={t('Assignee')} />
          ),
          cell: ({ row }) => (
            <span className="text-sm">
              {row.original.assigneeId
                ? nameOf(row.original.assigneeId)
                : t('Unassigned')}
            </span>
          ),
        },
        {
          accessorKey: 'severity',
          size: 90,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title={t('Severity')} />
          ),
          cell: ({ row }) => (
            <IssueSeverityBadge severity={row.original.severity} />
          ),
        },
      ],
      [nameOf],
    );

  const bulkActions: BulkAction<IssueWithSeverity>[] = [
    {
      render: (_rows, resetSelection) => {
        const ids = selectedRows.map((row) => row.id);
        const apply = (update: BulkUpdate) => {
          batchUpdate(
            { projectId, ids, ...update },
            {
              onSuccess: () => {
                resetSelection();
                setSelectedRows([]);
              },
            },
          );
        };
        return selectedRows.length === 0 ? null : (
          <div className="flex items-center gap-1">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" disabled={!canWrite}>
                  <UserCheck className="size-4 mr-1" />
                  {t('Assign')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {assignable.map((member) => (
                  <DropdownMenuItem
                    key={member.id}
                    onSelect={() => apply({ assigneeId: member.id })}
                  >
                    {member.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => apply({ assigneeId: null })}>
                  {t('Remove assignee')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canWrite}
              onClick={() => apply({ status: IssueStatus.INVESTIGATING })}
            >
              <CircleAlert className="size-4 mr-1" />
              {t('Mark investigating')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canWrite}
              onClick={() => apply({ status: IssueStatus.RESOLVED })}
            >
              <CheckCircle2 className="size-4 mr-1" />
              {t('Mark resolved')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canWrite}
              onClick={() => apply({ status: IssueStatus.IGNORED })}
            >
              <EyeOff className="size-4 mr-1" />
              {t('Ignore')}
            </Button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" disabled={!canWrite}>
                  <BellOff className="size-4 mr-1" />
                  {t('Mute')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{t('Mute alerts for')}</DropdownMenuLabel>
                {MUTE_HOURS.map((hours) => (
                  <DropdownMenuItem
                    key={hours}
                    onSelect={() => apply({ mutedForHours: hours })}
                  >
                    {t('{hours} hours', { hours })}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4 w-full">
      {summary && (
        <>
          <p className="text-sm text-muted-foreground">
            {t(
              'Last 7 days: {failures} failures → {issues} issues → {alerts} alerts',
              {
                failures: summary.failuresLast7Days,
                issues: summary.issuesLast7Days,
                alerts: summary.alertsLast7Days,
              },
            )}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              active={view === IssueListView.OPEN}
              title={t('Open')}
              value={summary.open}
              hint={t('{count} high severity', {
                count: summary.openHighSeverity,
              })}
              onClick={() => setView(IssueListView.OPEN)}
            />
            <SummaryCard
              active={view === IssueListView.INVESTIGATING}
              title={t('Investigating')}
              value={summary.investigating}
              hint={t('{count} assigned to me', {
                count: summary.investigatingAssignedToMe,
              })}
              onClick={() => setView(IssueListView.INVESTIGATING)}
            />
            <SummaryCard
              active={view === IssueListView.TODAY}
              title={t('New or reopened today')}
              value={summary.newOrReopenedToday}
              hint={t('Includes reopened issues')}
              onClick={() => setView(IssueListView.TODAY)}
            />
            <SummaryCard
              active={view === IssueListView.MUTED}
              title={t('Muted')}
              value={summary.muted}
              hint={t('Alerts paused')}
              onClick={() => setView(IssueListView.MUTED)}
            />
          </div>
        </>
      )}
      <DataTable
        emptyStateTextTitle={t('No issues')}
        emptyStateTextDescription={t(
          'Failed production runs are grouped here by cause, so one problem only alerts once.',
        )}
        emptyStateIcon={<Siren className="size-14" />}
        columns={columns}
        page={page}
        isLoading={isLoading}
        isError={isError}
        filters={filters}
        selectColumn={canWrite}
        onSelectedRowsChange={setSelectedRows}
        bulkActions={bulkActions}
        onRowClick={(row, newWindow) => {
          const path = authenticationSession.appendProjectRoutePrefix(
            `/issues/${row.id}`,
          );
          if (newWindow) {
            window.open(path, '_blank');
            return;
          }
          navigate(path);
        }}
      />
    </div>
  );
}

function SummaryCard({
  title,
  value,
  hint,
  active,
  onClick,
}: {
  title: string;
  value: number;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors hover:bg-accent',
        active && 'border-primary bg-primary/5',
      )}
    >
      <span className="text-sm text-muted-foreground">{title}</span>
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

function viewLabel(view: IssueListView): string {
  switch (view) {
    case IssueListView.UNRESOLVED:
      return t('Unresolved');
    case IssueListView.OPEN:
      return t('Open');
    case IssueListView.REOPENED:
      return t('Reopened');
    case IssueListView.INVESTIGATING:
      return t('Investigating');
    case IssueListView.TODAY:
      return t('New or reopened today');
    case IssueListView.MUTED:
      return t('Muted');
    case IssueListView.RESOLVED:
      return t('Resolved');
    case IssueListView.IGNORED:
      return t('Ignored');
    case IssueListView.ALL:
      return t('All');
  }
}

function readEnum<T extends string, F extends T | undefined>({
  value,
  values,
  fallback,
}: {
  value: string | null;
  values: T[];
  fallback: F;
}): T | F {
  const match = values.find((candidate) => candidate === value);
  return match ?? fallback;
}

function isMuted(mutedUntil: string | null | undefined): boolean {
  return !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();
}

const DEFAULT_LIMIT = 20;
const MUTE_HOURS = [1, 4, 24] as const;
const VIEW_ORDER = [
  IssueListView.UNRESOLVED,
  IssueListView.OPEN,
  IssueListView.REOPENED,
  IssueListView.INVESTIGATING,
  IssueListView.TODAY,
  IssueListView.MUTED,
  IssueListView.RESOLVED,
  IssueListView.IGNORED,
  IssueListView.ALL,
];

type BulkUpdate = {
  status?: IssueStatus;
  assigneeId?: string | null;
  mutedForHours?: 1 | 4 | 24;
};

export { IssuesPage };
