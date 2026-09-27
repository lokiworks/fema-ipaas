import { isNil } from '@fema-ipaas/core-utils';
import {
  McpServerAuthType,
  McpServerStatus,
  McpServerTransport,
  McpServerUsageKind,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  RefreshCwIcon,
  ServerIcon,
  ServerOffIcon,
  Settings2Icon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  McpServerDeleteDialog,
  McpServerDialog,
  McpToolTryDrawer,
  mcpProbeMessageUtils,
  mcpServerAccessUtils,
  mcpServersHooks,
  mcpServersMutations,
} from '@/features/mcp-servers';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

export default function McpServerDetailPage() {
  const params = useParams<{ serverId: string }>();
  const serverId = params.serverId ?? '';
  const navigate = useNavigate();
  const [tab, setTab] = useState<'tools' | 'usage' | 'settings'>('tools');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tryingToolName, setTryingToolName] = useState<string | null>(null);

  const {
    data: server,
    isLoading,
    isError,
  } = mcpServersHooks.useMcpServer(serverId);
  const { data: usage } = mcpServersHooks.useMcpServerUsage(serverId);
  const { mutate: sync, isPending: syncing } =
    mcpServersMutations.useSyncMcpServerTools({
      id: serverId,
      onSuccess: (response) => {
        if (response.added.length === 0 && response.removed.length === 0) {
          toast.success(t('The tool list is already up to date'));
        } else {
          toast.success(
            t('Sync complete: {added}{removed}', {
              added:
                response.added.length > 0
                  ? t('added {names}', { names: response.added.join('、') })
                  : '',
              removed:
                response.removed.length > 0
                  ? t('removed {names}', { names: response.removed.join('、') })
                  : '',
            }),
          );
        }
        if (response.removedInUse.length > 0) {
          toast.warning(
            t(
              '{names} were removed by the server but workflows still use them',
              {
                names: response.removedInUse.join('、'),
              },
            ),
          );
        }
      },
      onError: (error) => {
        toast.error(
          api.extractServerErrorMessage(error, 'Failed to sync tools'),
        );
      },
    });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || isNil(server)) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ServerOffIcon />
          </EmptyMedia>
          <EmptyTitle>{t('This MCP server is not available')}</EmptyTitle>
          <EmptyDescription>
            {t(
              'It may only be open to specific projects you are not in, or it has been deleted.',
            )}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => navigate('/tenant/connectors?cat=mcp')}>
            {t('Back to MCP servers')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const connected = server.status === McpServerStatus.CONNECTED;
  const manageTip = server.canManage
    ? null
    : t('Only the owner ({name}) and tenant admins can change this', {
        name: server.ownerName ?? '-',
      });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-4 rounded-lg border p-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted">
          <ServerIcon className="size-8" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{server.displayName}</h1>
            <Badge variant="outline">{t('MCP server')}</Badge>
            <Badge variant={connected ? 'success' : 'destructive'}>
              {connected ? t('Connected') : t('Connection error')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {server.description || t('No description')}
          </p>
          <div className="max-w-md">
            <CopyToClipboardInput textToCopy={server.url} useInput />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              {t('Transport: {value}', {
                value:
                  server.transport === McpServerTransport.SSE
                    ? 'SSE'
                    : 'Streamable HTTP',
              })}
            </span>
            <span>
              {t('Authentication: {value}', {
                value: authTypeLabel(server.authType),
              })}
            </span>
            <span>
              {t('Scope: {value}', {
                value: mcpServerAccessUtils.scopeText({ server }),
              })}
            </span>
            <span>
              {t('Owner: {value}', { value: server.ownerName ?? '-' })}
            </span>
            <span>
              {t('Added on {date}', {
                date: new Date(server.created).toLocaleDateString(),
              })}
            </span>
            <span>
              {server.lastSyncedAt
                ? t('Last synced {date}', {
                    date: new Date(server.lastSyncedAt).toLocaleString(),
                  })
                : t('Never synced')}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={manageTip ? 0 : undefined}>
                <Button
                  disabled={!server.canManage}
                  loading={syncing}
                  onClick={() => sync()}
                >
                  <RefreshCwIcon className="mr-1 size-4" />
                  {t('Sync tools')}
                </Button>
              </span>
            </TooltipTrigger>
            {manageTip && <TooltipContent>{manageTip}</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={manageTip ? 0 : undefined}>
                <Button
                  variant="outline"
                  disabled={!server.canManage}
                  onClick={() => setEditing(true)}
                >
                  <Settings2Icon className="mr-1 size-4" />
                  {t('Edit connection settings')}
                </Button>
              </span>
            </TooltipTrigger>
            {manageTip && <TooltipContent>{manageTip}</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={manageTip ? 0 : undefined}>
                <Button
                  variant="outline"
                  disabled={!server.canManage}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2Icon className="mr-1 size-4" />
                  {t('Delete')}
                </Button>
              </span>
            </TooltipTrigger>
            {manageTip && <TooltipContent>{manageTip}</TooltipContent>}
          </Tooltip>
        </div>
      </div>
      {!connected && (
        <Alert variant="destructive">
          <AlertTitle>{t('Connection error')}</AlertTitle>
          <AlertDescription>
            {server.lastError
              ? mcpProbeMessageUtils.failureMessage(server.lastError)
              : t('Could not reach the server')}
            {!server.canManage &&
              t(' Please contact the owner ({name}).', {
                name: server.ownerName ?? '-',
              })}
            {usage && usage.workflows.length > 0 && (
              <div className="mt-1">
                {t(
                  'Affects {count} workflows: steps and agent tools using it will fail until the connection recovers.',
                  { count: usage.workflows.length },
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
      <Alert>
        <AlertTitle>{t('Where these tools show up')}</AlertTitle>
        <AlertDescription>
          {t(
            'While connected, this server appears under "Apps" in the step picker so its tools can be added as steps; it can also be added to an AI agent step\'s tools, where the agent decides on its own when to call it.',
          )}
        </AlertDescription>
      </Alert>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === 'tools' || value === 'usage' || value === 'settings') {
            setTab(value);
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="tools">
            {t('Tools')} ({server.tools.length})
          </TabsTrigger>
          <TabsTrigger value="usage">
            {t('Usage')} ({usage?.workflows.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="settings">{t('Connection settings')}</TabsTrigger>
        </TabsList>
        <TabsContent value="tools">
          {server.tools.length === 0 ? (
            <Empty className="mt-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ServerOffIcon />
                </EmptyMedia>
                <EmptyTitle>{t('No tools discovered yet')}</EmptyTitle>
                <EmptyDescription>
                  {connected
                    ? t(
                        'Click "Sync tools" to read the server\'s tool list again.',
                      )
                    : t('Click "Sync tools" once the connection recovers.')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {server.tools.map((tool) => (
                <div key={tool.name} className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {tool.title ?? tool.name}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {tool.name}
                    </span>
                    <span className="grow" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={connected ? undefined : 0}>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!connected}
                            onClick={() => setTryingToolName(tool.name)}
                          >
                            {t('Try it')}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!connected && (
                        <TooltipContent>
                          {t(
                            'The server connection is broken; try again once it recovers',
                          )}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </div>
                  {tool.description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tool.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="usage">
          {(usage?.workflows.length ?? 0) === 0 ? (
            <Empty className="mt-4">
              <EmptyHeader>
                <EmptyTitle>{t('No workflow uses it yet')}</EmptyTitle>
                <EmptyDescription>
                  {t(
                    'Drag its tools into a workflow in the editor, or add them to an AI agent.',
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Workflow')}</TableHead>
                    <TableHead>{t('Project')}</TableHead>
                    <TableHead>{t('Usage')}</TableHead>
                    <TableHead>{t('Step')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage?.workflows.flatMap((workflow) =>
                    workflow.items.map((item) => (
                      <TableRow
                        key={`${workflow.workflowId}-${item.stepName}`}
                        className="cursor-pointer"
                        onClick={() =>
                          navigate(
                            authenticationSession.appendProjectRoutePrefix(
                              `/workflows/${workflow.workflowId}`,
                            ),
                          )
                        }
                      >
                        <TableCell>{workflow.displayName}</TableCell>
                        <TableCell>{workflow.projectDisplayName}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.kind === McpServerUsageKind.AGENT
                                ? 'secondary'
                                : 'outline'
                            }
                          >
                            {item.kind === McpServerUsageKind.AGENT
                              ? t('Agent tool')
                              : t('Workflow step')}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.stepDisplayName}</TableCell>
                      </TableRow>
                    )),
                  )}
                </TableBody>
              </Table>
              {usage && usage.hiddenWorkflowCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    'Another {count} workflows are in projects you cannot see.',
                    {
                      count: usage.hiddenWorkflowCount,
                    },
                  )}
                </p>
              )}
            </div>
          )}
        </TabsContent>
        <TabsContent value="settings">
          <div className="mt-4 flex flex-col gap-4 rounded-md border p-4">
            <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t('Name')}</dt>
              <dd>{server.displayName}</dd>
              <dt className="text-muted-foreground">{t('Description')}</dt>
              <dd>{server.description || '-'}</dd>
              <dt className="text-muted-foreground">{t('Server address')}</dt>
              <dd className="font-mono">{server.url}</dd>
              <dt className="text-muted-foreground">{t('Transport')}</dt>
              <dd>
                {server.transport === McpServerTransport.SSE
                  ? t('SSE (legacy protocol)')
                  : t('Streamable HTTP')}
              </dd>
              <dt className="text-muted-foreground">{t('Authentication')}</dt>
              <dd>
                {authTypeLabel(server.authType)}
                {server.authType !== McpServerAuthType.NONE &&
                  (server.authConfigured
                    ? t(' · configured, stored encrypted, not shown here')
                    : t(' · not configured'))}
              </dd>
              <dt className="text-muted-foreground">
                {t('Available projects')}
              </dt>
              <dd>
                {server.allProjects
                  ? t('All projects')
                  : server.projects
                      .map((project) => project.displayName)
                      .join('、')}
              </dd>
              <dt className="text-muted-foreground">{t('Owner')}</dt>
              <dd>{server.ownerName ?? '-'}</dd>
            </dl>
            {server.canManage && (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => setEditing(true)}
              >
                <Settings2Icon className="mr-1 size-4" />
                {t('Edit connection settings')}
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>
      <McpServerDialog
        open={editing}
        onOpenChange={setEditing}
        existing={server}
        onSaved={() => setEditing(false)}
      />
      <McpServerDeleteDialog
        server={server}
        open={deleting}
        onOpenChange={setDeleting}
      />
      <McpToolTryDrawer
        server={server}
        tool={server.tools.find((tool) => tool.name === tryingToolName) ?? null}
        onClose={() => setTryingToolName(null)}
      />
    </div>
  );
}

function authTypeLabel(authType: McpServerAuthType): string {
  switch (authType) {
    case McpServerAuthType.NONE:
      return t('None required');
    case McpServerAuthType.BEARER:
      return t('Bearer token');
    case McpServerAuthType.OAUTH2:
      return t('OAuth 2.0');
  }
}
