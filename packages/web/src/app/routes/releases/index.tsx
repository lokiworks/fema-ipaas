import { Permission } from '@fema-ipaas/core-utils';
import {
  ApplicationEvent,
  ApplicationEventName,
  ConnectionWithoutSensitiveData,
  WorkflowReleaseStatus,
  WorkflowReleaseWithWorkflow,
} from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import { ArrowRight, Rocket, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  CURSOR_QUERY_PARAM,
  DataTable,
  DataTableFilters,
  LIMIT_QUERY_PARAM,
  RowDataWithActions,
} from '@/components/custom/data-table';
import { DataTableColumnHeader } from '@/components/custom/data-table/data-table-column-header';
import { FormattedDate } from '@/components/custom/formatted-date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { auditEventUtils } from '@/features/audit-events';
import { connectionsApi } from '@/features/connections/api/connections';
import { issueMembersHooks } from '@/features/issues';
import { projectCollectionUtils } from '@/features/projects';
import {
  EnvironmentsSection,
  releasesHooks,
  releaseUiUtils,
} from '@/features/releases';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';

function ReleasesPage() {
  const { project } = projectCollectionUtils.useCurrentProject();
  const { checkAccess } = useAuthorization();
  const [searchParams] = useSearchParams();
  const canManage = checkAccess(Permission.WRITE_PROJECT);
  const opensRequests =
    project.releasesEnabled &&
    (searchParams.get('tab') === REQUESTS_TAB ||
      searchParams.has('status') ||
      searchParams.has('mine'));
  return (
    <Tabs
      defaultValue={opensRequests ? REQUESTS_TAB : ENVIRONMENTS_TAB}
      className="w-full"
    >
      <TabsList>
        <TabsTrigger value={ENVIRONMENTS_TAB}>{t('Environments')}</TabsTrigger>
        {project.releasesEnabled && (
          <TabsTrigger value={REQUESTS_TAB}>
            {t('Release requests')}
          </TabsTrigger>
        )}
        {project.releasesEnabled && (
          <TabsTrigger value={HISTORY_TAB}>{t('Change history')}</TabsTrigger>
        )}
      </TabsList>
      <TabsContent value={ENVIRONMENTS_TAB}>
        <EnvironmentsSection
          testConnections={<TestConnections canManage={canManage} />}
        />
      </TabsContent>
      {project.releasesEnabled && (
        <TabsContent value={REQUESTS_TAB}>
          <ReleaseRequests />
        </TabsContent>
      )}
      {project.releasesEnabled && (
        <TabsContent value={HISTORY_TAB}>
          <ChangeHistory />
        </TabsContent>
      )}
    </Tabs>
  );
}

function ReleaseRequests() {
  const projectId = authenticationSession.getProjectId()!;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { nameOf } = issueMembersHooks.useIssueMembers();
  const status = Object.values(WorkflowReleaseStatus).find(
    (value) => value === searchParams.get('status'),
  );
  const mine = searchParams.get('mine') === 'approver' ? 'approver' : undefined;
  const {
    data: page,
    isLoading,
    isError,
  } = releasesHooks.useReleases({
    projectId,
    status,
    mine,
    cursor: searchParams.get(CURSOR_QUERY_PARAM) ?? undefined,
    limit: Number(searchParams.get(LIMIT_QUERY_PARAM) ?? DEFAULT_LIMIT),
  });

  const filters: DataTableFilters<'status' | 'mine'>[] = [
    {
      type: 'select',
      title: t('Status'),
      accessorKey: 'status',
      options: Object.values(WorkflowReleaseStatus).map((value) => ({
        value,
        label: releaseUiUtils.statusLabel(value),
      })),
    },
    {
      type: 'select',
      title: t('Approver'),
      accessorKey: 'mine',
      options: [{ value: 'approver', label: t('Waiting for me') }],
    },
  ];

  const columns: ColumnDef<
    RowDataWithActions<WorkflowReleaseWithWorkflow>,
    unknown
  >[] = [
    {
      accessorKey: 'workflowDisplayName',
      size: 320,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Workflow')}
          icon={Rocket}
        />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">
            {row.original.workflowDisplayName}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {row.original.note}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      size: 120,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Status')} />
      ),
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]}>
          {releaseUiUtils.statusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'requestedById',
      size: 140,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Requested by')} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{nameOf(row.original.requestedById)}</span>
      ),
    },
    {
      accessorKey: 'approverIds',
      size: 160,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Approvers')} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.approverIds.map(nameOf).join('、')}
        </span>
      ),
    },
    {
      accessorKey: 'created',
      size: 160,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Requested at')} />
      ),
      cell: ({ row }) => (
        <FormattedDate date={new Date(row.original.created)} />
      ),
    },
  ];

  return (
    <DataTable
      emptyStateTextTitle={t('No release requests')}
      emptyStateTextDescription={t(
        'Promotions from test to production show up here, including the ones that went live without approval.',
      )}
      emptyStateIcon={<Rocket className="size-14" />}
      columns={columns}
      page={page}
      isLoading={isLoading}
      isError={isError}
      filters={filters}
      onRowClick={(row) =>
        navigate(
          authenticationSession.appendProjectRoutePrefix(`/releases/${row.id}`),
        )
      }
    />
  );
}

function ChangeHistory() {
  const projectId = authenticationSession.getProjectId()!;
  const [cursors, setCursors] = useState<string[]>([]);
  const { data, isLoading } = releasesHooks.useHistory({
    projectId,
    cursor: cursors[cursors.length - 1],
  });
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  const events = data?.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-44">{t('Time')}</TableHead>
            <TableHead className="w-48">{t('Actor')}</TableHead>
            <TableHead className="w-40">{t('Action')}</TableHead>
            <TableHead>{t('Details')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                {t(
                  'No changes yet. Deploying to test, promoting, approving and rolling back are all recorded here.',
                )}
              </TableCell>
            </TableRow>
          )}
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell>
                <FormattedDate date={new Date(event.created)} />
              </TableCell>
              <TableCell className="truncate">
                {event.userEmail ?? '—'}
              </TableCell>
              <TableCell>{auditEventUtils.actionLabel(event.action)}</TableCell>
              <TableCell className="text-muted-foreground">
                <div className="flex flex-col">
                  <span>{auditEventUtils.summarize(event)}</span>
                  {historyNote(event) && (
                    <span className="text-xs">{historyNote(event)}</span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={cursors.length === 0}
          onClick={() => setCursors(cursors.slice(0, -1))}
        >
          {t('Previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.next}
          onClick={() => data?.next && setCursors([...cursors, data.next])}
        >
          {t('Next')}
        </Button>
      </div>
    </div>
  );
}

function historyNote(event: ApplicationEvent): string | null {
  switch (event.action) {
    case ApplicationEventName.RELEASE_REQUESTED:
      return event.data.note ?? null;
    case ApplicationEventName.RELEASE_APPROVED:
    case ApplicationEventName.RELEASE_REJECTED:
      return event.data.comment ?? null;
    default:
      return null;
  }
}

function TestConnections({ canManage }: { canManage: boolean }) {
  const projectId = authenticationSession.getProjectId()!;
  const { data: replacements } = releasesHooks.useReplacements(projectId);
  const { mutate: upsert, isPending } = releasesHooks.useUpsertReplacement();
  const { mutate: remove } = releasesHooks.useDeleteReplacement();
  const { data: connectionsPage } = useQuery({
    queryKey: ['release-settings-connections', projectId],
    queryFn: () => connectionsApi.list({ projectId, limit: MAX_CONNECTIONS }),
  });
  const connections = connectionsPage?.data ?? [];
  const [source, setSource] = useState<string | undefined>(undefined);
  const [target, setTarget] = useState<string | undefined>(undefined);
  const sourceConnection = connections.find(
    (connection) => connection.id === source,
  );
  const targets = connections.filter(
    (connection) =>
      connection.id !== source &&
      (!sourceConnection ||
        connection.connectorName === sourceConnection.connectorName),
  );
  const nameOf = (id: string) =>
    connections.find((connection) => connection.id === id)?.displayName ??
    t('Deleted connection');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Test connections')}</CardTitle>
        <CardDescription>
          {t(
            'Runs in test use these connections instead of the production ones, so steps do not need to change. Variables can also have a separate test value.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {(replacements ?? []).map((replacement) => (
            <li
              key={replacement.id}
              className="flex items-center justify-between gap-2 text-sm rounded-md border px-3 py-2"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate">
                  {nameOf(replacement.sourceConnectionId)}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {nameOf(replacement.targetConnectionId)}
                </span>
              </span>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('Delete')}
                  onClick={() => remove(replacement.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
          {(replacements ?? []).length === 0 && (
            <li className="text-sm text-muted-foreground">
              {t(
                'No test connections yet. Test runs use the production connections.',
              )}
            </li>
          )}
        </ul>
        {canManage && (
          <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
            <ConnectionSelect
              value={source}
              placeholder={t('Production connection')}
              connections={connections}
              onChange={(value) => {
                setSource(value);
                setTarget(undefined);
              }}
            />
            <ArrowRight className="size-4 text-muted-foreground" />
            <ConnectionSelect
              value={target}
              placeholder={t('Test connection')}
              connections={targets}
              onChange={setTarget}
            />
            <Button
              size="sm"
              disabled={!source || !target || isPending}
              onClick={() => {
                if (source && target) {
                  upsert(
                    {
                      projectId,
                      sourceConnectionId: source,
                      targetConnectionId: target,
                    },
                    {
                      onSuccess: () => {
                        setSource(undefined);
                        setTarget(undefined);
                      },
                    },
                  );
                }
              }}
            >
              {t('Add')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectionSelect({
  value,
  placeholder,
  connections,
  onChange,
}: {
  value: string | undefined;
  placeholder: string;
  connections: ConnectionWithoutSensitiveData[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {connections.map((connection) => (
          <SelectItem key={connection.id} value={connection.id}>
            {connection.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const DEFAULT_LIMIT = 20;
const ENVIRONMENTS_TAB = 'environments';
const REQUESTS_TAB = 'requests';
const HISTORY_TAB = 'history';
const MAX_CONNECTIONS = 500;
const STATUS_VARIANT: Record<
  WorkflowReleaseStatus,
  'info' | 'success' | 'destructive' | 'outline'
> = {
  [WorkflowReleaseStatus.PENDING]: 'info',
  [WorkflowReleaseStatus.DEPLOYED]: 'success',
  [WorkflowReleaseStatus.REJECTED]: 'destructive',
  [WorkflowReleaseStatus.WITHDRAWN]: 'outline',
};

export { ReleasesPage };
