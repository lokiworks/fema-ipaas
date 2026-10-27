import { isNil, Permission } from '@fema-ipaas/core-utils';
import {
  ConnectionWithoutSensitiveData,
  ReleaseChangeAction,
  ReleaseChangeWithDetails,
  WorkflowReleaseStatus,
  WorkflowReleaseWithWorkflow,
} from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { t } from 'i18next';
import { ArrowRight, CircleAlert, History, Rocket, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ConsolePage } from '@/components/custom/console-page';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = checkAccess(Permission.WRITE_PROJECT);
  const requestedTab = searchParams.get('tab');
  const opensRequests =
    project.releasesEnabled &&
    (requestedTab === REQUESTS_TAB ||
      searchParams.has('status') ||
      searchParams.has('mine'));
  const activeTab =
    TABS.find((tab) => tab === requestedTab) ??
    (opensRequests ? REQUESTS_TAB : ENVIRONMENTS_TAB);
  const changeTab = (tab: string) =>
    setSearchParams(new URLSearchParams({ tab }), { replace: true });
  return (
    <ConsolePage
      title={t('Releases and approvals')}
      description={t(
        'Publish workflows to the test and production environments, review requests and trace every change.',
      )}
    >
      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList>
          <TabsTrigger value={ENVIRONMENTS_TAB}>
            {t('Environments')}
          </TabsTrigger>
          {project.releasesEnabled && (
            <TabsTrigger value={REQUESTS_TAB}>
              {t('Release requests')}
            </TabsTrigger>
          )}
          <TabsTrigger value={HISTORY_TAB}>{t('Change history')}</TabsTrigger>
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
        <TabsContent value={HISTORY_TAB}>
          <ChangeHistory />
        </TabsContent>
      </Tabs>
    </ConsolePage>
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data, isLoading, isError } = releasesHooks.useChanges({
    projectId,
    cursor: searchParams.get(CURSOR_QUERY_PARAM) ?? undefined,
    limit: Number(searchParams.get(LIMIT_QUERY_PARAM) ?? DEFAULT_LIMIT),
  });

  const columns: ColumnDef<
    RowDataWithActions<ReleaseChangeWithDetails>,
    unknown
  >[] = [
    {
      accessorKey: 'created',
      size: 180,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Time')} />
      ),
      cell: ({ row }) => (
        <FormattedDate date={new Date(row.original.created)} />
      ),
    },
    {
      accessorKey: 'actorName',
      size: 160,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Actor')} />
      ),
      cell: ({ row }) => (
        <span className="truncate text-sm">
          {row.original.actorName || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'action',
      size: 160,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Action')} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {releaseUiUtils.changeActionLabel(row.original.action)}
        </span>
      ),
    },
    {
      accessorKey: 'note',
      size: 420,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Details')} />
      ),
      cell: ({ row }) => (
        <div className="text-muted-foreground">
          <ChangeDetails change={row.original} />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      emptyStateTextTitle={t('No changes yet')}
      emptyStateTextDescription={t(
        'Deploying to test, promoting, approving and rolling back are all recorded here.',
      )}
      emptyStateIcon={<History className="size-14" />}
      columns={columns}
      page={data}
      isLoading={isLoading}
      isError={isError}
      onRowClick={(row) => {
        if (row.releaseId) {
          navigate(
            authenticationSession.appendProjectRoutePrefix(
              `/releases/${row.releaseId}`,
            ),
          );
        }
      }}
    />
  );
}

function ChangeDetails({ change }: { change: ReleaseChangeWithDetails }) {
  const versions = versionPath(change);
  const approvers = approversText(change);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-foreground">{headline(change)}</span>
      {versions && <span className="text-xs">{versions}</span>}
      {change.note && <span className="text-xs">{change.note}</span>}
      {change.comment && (
        <span className="text-xs">
          {t('Comment: {comment}', {
            comment: releaseUiUtils.commentText(change.comment),
          })}
        </span>
      )}
      {approvers && <span className="text-xs">{approvers}</span>}
    </div>
  );
}

function headline(change: ReleaseChangeWithDetails): string {
  if (change.action === ReleaseChangeAction.ENVIRONMENTS_UPDATED) {
    return change.environmentsEnabled
      ? t('Test and production environments turned on')
      : t('Test and production environments turned off');
  }
  return change.workflowDisplayName ?? '';
}

function versionPath(change: ReleaseChangeWithDetails): string | null {
  const from = versionText(change.fromVersionNumber);
  const to = versionText(change.toVersionNumber);
  if (change.action === ReleaseChangeAction.ROLLED_BACK) {
    return t('Production {from} → {to}, with the content of {restored}', {
      from: from ?? t('Not published yet'),
      to: to ?? '',
      restored: versionText(change.restoredVersionNumber) ?? '',
    });
  }
  if (isNil(to)) {
    return null;
  }
  const target = TEST_ACTIONS.includes(change.action)
    ? t('Test environment')
    : t('Production');
  return t('{target} {from} → {to}', {
    target,
    from: from ?? t('Not published yet'),
    to,
  });
}

function approversText(change: ReleaseChangeWithDetails): string | null {
  if (
    change.action === ReleaseChangeAction.ENVIRONMENTS_UPDATED ||
    change.action === ReleaseChangeAction.REQUESTED ||
    change.action === ReleaseChangeAction.APPROVED ||
    change.action === ReleaseChangeAction.REJECTED
  ) {
    const names = change.approverNames.filter((name) => name.length > 0);
    return names.length > 0
      ? t('Approvers: {names}', { names: names.join('、') })
      : t('No approval required');
  }
  if (
    change.action === ReleaseChangeAction.ROLLED_BACK ||
    change.action === ReleaseChangeAction.PUBLISHED_DIRECTLY
  ) {
    return t('No approval required');
  }
  return null;
}

function versionText(versionNumber: number | null | undefined): string | null {
  return versionNumber ? `v${versionNumber}` : null;
}

function TestConnections({ canManage }: { canManage: boolean }) {
  const projectId = authenticationSession.getProjectId()!;
  const { data: replacements } = releasesHooks.useReplacements(projectId);
  const { mutate: upsert, isPending } = releasesHooks.useUpsertReplacement();
  const { mutate: remove } = releasesHooks.useDeleteReplacement();
  const { data: overview } = releasesHooks.useEnvironments({
    projectId,
    enabled: true,
    showErrorDialog: false,
  });
  const unreplaced = overview?.unreplacedConnections ?? [];
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
          {unreplaced.map((connection) => (
            <li
              key={connection.connectionId}
              className="flex items-center justify-between gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm"
              data-testid="unreplaced-connection"
            >
              <span className="flex min-w-0 items-start gap-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">
                      {connection.displayName}
                    </span>
                    <Badge variant="destructive">
                      {t('No test replacement')}
                    </Badge>
                  </span>
                  <span className="text-xs text-destructive">
                    {t(
                      'Test runs use the production account directly. Used by: {names}',
                      { names: connection.workflowNames.join('、') },
                    )}
                  </span>
                </span>
              </span>
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setSource(connection.connectionId);
                    setTarget(undefined);
                  }}
                >
                  {t('Set test connection')}
                </Button>
              )}
            </li>
          ))}
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
          {(replacements ?? []).length === 0 && unreplaced.length === 0 && (
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
const TABS = [ENVIRONMENTS_TAB, REQUESTS_TAB, HISTORY_TAB];
const TEST_ACTIONS: ReleaseChangeAction[] = [
  ReleaseChangeAction.DEPLOYED_TO_TEST,
];
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
