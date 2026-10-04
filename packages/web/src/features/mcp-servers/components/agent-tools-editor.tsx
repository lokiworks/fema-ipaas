import { McpServer, McpServerStatus, McpServerTool } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  FlaskConicalIcon,
  PlusIcon,
  ServerIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { mcpServersHooks } from '../hooks/mcp-servers-hooks';
import {
  AgentServerRow,
  AgentServerRowKind,
  AgentServerState,
  AgentToolRow,
  AgentToolsState,
  agentToolsUtils,
} from '../utils/agent-tools-utils';
import { mcpProbeMessageUtils } from '../utils/mcp-probe-messages';
import { mcpServerAccessUtils } from '../utils/mcp-server-access-utils';

import { McpToolTryDrawer } from './mcp-tool-try-drawer';

export function AgentToolsEditor({
  state,
  confirmWrites,
  projectId,
  disabled,
  onChange,
}: {
  state: AgentToolsState;
  confirmWrites: boolean;
  projectId: string;
  disabled: boolean;
  onChange: (state: AgentToolsState) => void;
}) {
  const { data, isLoading, isError } = mcpServersHooks.useMcpServers({});
  const [trying, setTrying] = useState<{
    server: McpServer;
    tool: McpServerTool;
  } | null>(null);
  const servers = (data ?? []).filter((server) =>
    mcpServerAccessUtils.isAvailableInProject({ server, projectId }),
  );
  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  const rows = agentToolsUtils.resolveRows({ entries: state.entries, servers });
  const candidates = agentToolsUtils.availableToAdd({
    entries: state.entries,
    servers,
  });
  const hasManual = rows.some((row) => row.kind === AgentServerRowKind.MANUAL);
  return (
    <div className="flex flex-col gap-3" data-testid="agent-tools-editor">
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {t(
              'The list of connected servers could not be loaded, so the status below may be out of date.',
            )}
          </AlertDescription>
        </Alert>
      )}
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t(
            'Pick the MCP servers this agent may use. The address and authorization are filled in for you.',
          )}
        </p>
      )}
      {rows.map((row) =>
        row.kind === AgentServerRowKind.LINKED ? (
          <LinkedServerCard
            key={`${row.index}-${row.externalId}`}
            row={row}
            rows={rows}
            state={state}
            servers={servers}
            confirmWrites={confirmWrites}
            disabled={disabled}
            onChange={onChange}
            onTry={(server, tool) => setTrying({ server, tool })}
          />
        ) : (
          <ManualServerCard
            key={`${row.index}-manual`}
            row={row}
            state={state}
            servers={servers}
            disabled={disabled}
            onChange={onChange}
          />
        ),
      )}
      {hasManual && state.allowedTools.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {t(
              'A tool list is in force, so tools of addresses entered by hand are blocked until you allow every tool again.',
            )}
          </AlertDescription>
        </Alert>
      )}
      {!disabled && (
        <AddServerControl
          candidates={candidates}
          onPick={(server) =>
            onChange(agentToolsUtils.addServer({ state, server, servers }))
          }
          onPickManual={() =>
            onChange(agentToolsUtils.addManualEntry({ state }))
          }
        />
      )}
      {trying !== null && (
        <McpToolTryDrawer
          server={trying.server}
          tool={trying.tool}
          onClose={() => setTrying(null)}
        />
      )}
    </div>
  );
}

function LinkedServerCard({
  row,
  rows,
  state,
  servers,
  confirmWrites,
  disabled,
  onChange,
  onTry,
}: {
  row: AgentServerRow;
  rows: AgentServerRow[];
  state: AgentToolsState;
  servers: McpServer[];
  confirmWrites: boolean;
  disabled: boolean;
  onChange: (state: AgentToolsState) => void;
  onTry: (server: McpServer, tool: McpServerTool) => void;
}) {
  const server = row.server;
  const toolRows = agentToolsUtils.toolRowsOf({
    row,
    rows,
    allowedTools: state.allowedTools,
    confirmTools: state.confirmTools,
    confirmWrites,
  });
  const failing =
    row.state === AgentServerState.MISSING ||
    row.state === AgentServerState.BROKEN;
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-3',
        failing && 'border-destructive',
      )}
      data-server-state={row.state}
      data-server={row.externalId}
    >
      <div className="flex items-start gap-2">
        <ServerIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 grow flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">
              {server?.displayName ?? row.externalId}
            </span>
            <ServerStatusBadge row={row} />
          </div>
          {server !== null && (
            <TextWithTooltip tooltipMessage={server.url}>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {server.url}
              </p>
            </TextWithTooltip>
          )}
        </div>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('Remove server {name}', {
              name: server?.displayName ?? row.externalId ?? '',
            })}
            onClick={() =>
              onChange(
                agentToolsUtils.removeEntry({
                  state,
                  index: row.index,
                  servers,
                }),
              )
            }
          >
            <Trash2Icon />
          </Button>
        )}
      </div>
      <ServerStateNotice
        row={row}
        disabled={disabled}
        onRefresh={() =>
          server !== null &&
          onChange(
            agentToolsUtils.refreshEntry({ state, index: row.index, server }),
          )
        }
      />
      {server !== null && toolRows.length > 0 && (
        <ToolList
          server={server}
          toolRows={toolRows}
          allowedCount={toolRows.filter((toolRow) => toolRow.allowed).length}
          limited={state.allowedTools.length > 0}
          disabled={disabled}
          onAllowEvery={() =>
            onChange(agentToolsUtils.allowEveryTool({ state }))
          }
          onToggleAllowed={(key, allowed) =>
            onChange(
              agentToolsUtils.setAllowed({ state, servers, key, allowed }),
            )
          }
          canDisallow={(key) =>
            agentToolsUtils.canDisallow({ state, servers, key })
          }
          onToggleConfirm={(key, confirm) =>
            onChange(agentToolsUtils.setConfirm({ state, key, confirm }))
          }
          onTry={(tool) => onTry(server, tool)}
        />
      )}
      {server !== null && toolRows.length === 0 && !failing && (
        <p className="text-xs text-muted-foreground">
          {t('This server lists no tools yet. Sync it from its detail page.')}
        </p>
      )}
    </div>
  );
}

function ServerStatusBadge({ row }: { row: AgentServerRow }) {
  const server = row.server;
  if (row.state === AgentServerState.MISSING || server === null) {
    return <Badge variant="destructive">{t('Server removed')}</Badge>;
  }
  if (row.state === AgentServerState.BROKEN) {
    return <Badge variant="destructive">{t('Connection error')}</Badge>;
  }
  return (
    <Badge variant="success">
      {t('Connected')} · {t('{count} tools', { count: server.tools.length })}
    </Badge>
  );
}

function ServerStateNotice({
  row,
  disabled,
  onRefresh,
}: {
  row: AgentServerRow;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const server = row.server;
  if (row.state === AgentServerState.MISSING) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('This server is gone')}</AlertTitle>
        <AlertDescription>
          {t(
            'It was deleted or is not available in this project any more. This step cannot be published until you remove it or pick another server.',
          )}
        </AlertDescription>
      </Alert>
    );
  }
  if (row.state === AgentServerState.BROKEN && server !== null) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('This server cannot be reached')}</AlertTitle>
        <AlertDescription>
          {server.lastError !== null
            ? mcpProbeMessageUtils.failureMessage(server.lastError)
            : t('The last connection test failed.')}{' '}
          {t('This step cannot be published until the connection works again.')}
        </AlertDescription>
      </Alert>
    );
  }
  if (row.state === AgentServerState.STALE) {
    return (
      <Alert variant="warning">
        <AlertTitle>{t('The server settings changed')}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          {t(
            'The address or authorization stored in this step is not the current one.',
          )}
          {!disabled && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={onRefresh}
            >
              {t('Update from the server')}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

function ToolList({
  server,
  toolRows,
  allowedCount,
  limited,
  disabled,
  onAllowEvery,
  onToggleAllowed,
  canDisallow,
  onToggleConfirm,
  onTry,
}: {
  server: McpServer;
  toolRows: AgentToolRow[];
  allowedCount: number;
  limited: boolean;
  disabled: boolean;
  onAllowEvery: () => void;
  onToggleAllowed: (key: string, allowed: boolean) => void;
  canDisallow: (key: string) => boolean;
  onToggleConfirm: (key: string, confirm: boolean) => void;
  onTry: (tool: McpServerTool) => void;
}) {
  const connected = server.status === McpServerStatus.CONNECTED;
  return (
    <div className="flex flex-col gap-2" data-testid="agent-tool-list">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {t('Allowed tools: {allowed} of {total}', {
            allowed: allowedCount,
            total: toolRows.length,
          })}
        </span>
        {limited && !disabled && (
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto p-0 text-xs"
            onClick={onAllowEvery}
          >
            {t('Allow every tool')}
          </Button>
        )}
      </div>
      <div className="flex flex-col divide-y rounded-md border">
        {toolRows.map((toolRow) => (
          <ToolRowItem
            key={toolRow.key}
            toolRow={toolRow}
            disabled={disabled}
            canDisallow={canDisallow(toolRow.key)}
            canTry={connected}
            onToggleAllowed={(allowed) => onToggleAllowed(toolRow.key, allowed)}
            onToggleConfirm={(confirm) => onToggleConfirm(toolRow.key, confirm)}
            onTry={() => onTry(toolRow.tool)}
          />
        ))}
      </div>
    </div>
  );
}

function ToolRowItem({
  toolRow,
  disabled,
  canDisallow,
  canTry,
  onToggleAllowed,
  onToggleConfirm,
  onTry,
}: {
  toolRow: AgentToolRow;
  disabled: boolean;
  canDisallow: boolean;
  canTry: boolean;
  onToggleAllowed: (allowed: boolean) => void;
  onToggleConfirm: (confirm: boolean) => void;
  onTry: () => void;
}) {
  const { tool, key, allowed, confirm, confirmLocked } = toolRow;
  const lastAllowed = allowed && !canDisallow;
  return (
    <div
      className={cn('flex flex-col gap-1.5 p-2', !allowed && 'opacity-60')}
      data-tool={key}
    >
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex">
              <Checkbox
                checked={allowed}
                disabled={disabled || lastAllowed}
                aria-label={t('Allow tool {name}', { name: key })}
                onCheckedChange={(checked) => onToggleAllowed(checked === true)}
              />
            </span>
          </TooltipTrigger>
          {lastAllowed && (
            <TooltipContent>
              {t('At least one tool must stay allowed.')}
            </TooltipContent>
          )}
        </Tooltip>
        <div className="flex min-w-0 grow flex-col">
          <span className="truncate text-sm">
            {agentToolsUtils.toolSummary({ tool })}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {key}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canTry}
          aria-label={t('Try tool {name}', { name: key })}
          onClick={onTry}
        >
          <FlaskConicalIcon />
        </Button>
      </div>
      {tool.description.length > 0 && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {tool.description}
        </p>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <label className="flex w-fit items-center gap-2 text-xs">
            <Switch
              size="sm"
              checked={confirm}
              disabled={disabled || confirmLocked || !allowed}
              aria-label={t('A person confirms tool {name}', { name: key })}
              onCheckedChange={onToggleConfirm}
            />
            {t('A person confirms each call')}
          </label>
        </TooltipTrigger>
        {confirmLocked && (
          <TooltipContent>
            {t(
              'The name looks like a write, and "Ask before write actions" is on, so this tool always asks.',
            )}
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  );
}

function ManualServerCard({
  row,
  state,
  servers,
  disabled,
  onChange,
}: {
  row: AgentServerRow;
  state: AgentToolsState;
  servers: McpServer[];
  disabled: boolean;
  onChange: (state: AgentToolsState) => void;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-dashed p-3"
      data-server-kind="manual"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {t('Address entered by hand')}
        </span>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('Remove address {index}', { index: row.index + 1 })}
            onClick={() =>
              onChange(
                agentToolsUtils.removeEntry({
                  state,
                  index: row.index,
                  servers,
                }),
              )
            }
          >
            <Trash2Icon />
          </Button>
        )}
      </div>
      <Input
        value={row.entry.url}
        disabled={disabled}
        placeholder="https://"
        aria-label={t('Server URL')}
        onChange={(event) =>
          onChange(
            agentToolsUtils.updateManualEntry({
              state,
              index: row.index,
              patch: { url: event.target.value },
            }),
          )
        }
      />
      <Input
        value={row.entry.authorization}
        disabled={disabled}
        placeholder={t('Authorization header value, optional')}
        aria-label={t('Authorization')}
        onChange={(event) =>
          onChange(
            agentToolsUtils.updateManualEntry({
              state,
              index: row.index,
              patch: { authorization: event.target.value },
            }),
          )
        }
      />
      <p className="text-xs text-muted-foreground">
        {t(
          'Use this only for a server that is not connected on the platform. Its tools are not listed here.',
        )}
      </p>
    </div>
  );
}

function AddServerControl({
  candidates,
  onPick,
  onPickManual,
}: {
  candidates: McpServer[];
  onPick: (server: McpServer) => void;
  onPickManual: () => void;
}) {
  return (
    <Select
      value=""
      onValueChange={(value) => {
        if (value === MANUAL_VALUE) {
          onPickManual();
          return;
        }
        const server = candidates.find((item) => item.externalId === value);
        if (server !== undefined) {
          onPick(server);
        }
      }}
    >
      <SelectTrigger
        className="w-full"
        aria-label={t('Pick an MCP server to add')}
        data-testid="agent-add-server"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <PlusIcon className="size-4" />
          <SelectValue placeholder={t('Pick an MCP server to add')} />
        </span>
      </SelectTrigger>
      <SelectContent>
        {candidates.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            {t(
              'No other connected server is available. Connect one under Connector Marketplace, MCP servers.',
            )}
          </p>
        )}
        {candidates.map((server) => (
          <SelectItem key={server.externalId} value={server.externalId}>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  server.status === McpServerStatus.CONNECTED
                    ? 'bg-success'
                    : 'bg-destructive',
                )}
              />
              <span className="truncate">{server.displayName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {server.status === McpServerStatus.CONNECTED
                  ? t('Connected')
                  : t('Connection error')}
                {' · '}
                {t('{count} tools', { count: server.tools.length })}
              </span>
            </span>
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={MANUAL_VALUE}>
          {t('Enter an address by hand')}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

const MANUAL_VALUE = '__manual__';
