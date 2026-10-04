import {
  agentMcpServers,
  agentToolPolicy,
  AgentMcpServerEntry,
  AgentMcpServerInfo,
} from '@fema-ipaas/core-utils';
import { McpServer, McpServerStatus, McpServerTool } from '@fema-ipaas/shared';

function infoOf(server: McpServer): AgentMcpServerInfo {
  return {
    externalId: server.externalId,
    displayName: server.displayName,
    url: server.url,
    authType: server.authType,
    ok: server.status === McpServerStatus.CONNECTED,
    toolNames: server.tools.map((tool) => tool.name),
  };
}

function resolveRows({
  entries,
  servers,
}: {
  entries: AgentMcpServerEntry[];
  servers: McpServer[];
}): AgentServerRow[] {
  const infos = servers.map(infoOf);
  return entries.map((entry, index) => {
    const externalId = agentMcpServers.externalIdOf({ entry, servers: infos });
    if (externalId === null) {
      return {
        index,
        entry,
        kind: AgentServerRowKind.MANUAL,
        externalId: null,
        server: null,
        state: AgentServerState.OK,
      };
    }
    const server =
      servers.find((candidate) => candidate.externalId === externalId) ?? null;
    return {
      index,
      entry,
      kind: AgentServerRowKind.LINKED,
      externalId,
      server,
      state: stateOf({ entry, server }),
    };
  });
}

function stateOf({
  entry,
  server,
}: {
  entry: AgentMcpServerEntry;
  server: McpServer | null;
}): AgentServerState {
  if (server === null) {
    return AgentServerState.MISSING;
  }
  if (server.status !== McpServerStatus.CONNECTED) {
    return AgentServerState.BROKEN;
  }
  const expected = agentMcpServers.entryOf({ server: infoOf(server) });
  return entry.url !== expected.url ||
    entry.authorization !== expected.authorization ||
    entry.server !== expected.server
    ? AgentServerState.STALE
    : AgentServerState.OK;
}

function availableToAdd({
  entries,
  servers,
}: {
  entries: AgentMcpServerEntry[];
  servers: McpServer[];
}): McpServer[] {
  const infos = servers.map(infoOf);
  const taken = new Set(
    entries.map((entry) =>
      agentMcpServers.externalIdOf({ entry, servers: infos }),
    ),
  );
  return servers.filter((server) => !taken.has(server.externalId));
}

function exposedNamesOf({
  rows,
}: {
  rows: AgentServerRow[];
}): Map<string, string> {
  const linked = rows.filter(
    (row): row is AgentServerRow & { server: McpServer } => row.server !== null,
  );
  const occurrences = linked
    .flatMap((row) => row.server.tools.map((tool) => tool.name))
    .reduce<Map<string, number>>(
      (counts, name) =>
        new Map([...counts, [name, (counts.get(name) ?? 0) + 1]]),
      new Map(),
    );
  return new Map(
    linked.flatMap((row) =>
      row.server.tools.map((tool): [string, string] => [
        `${row.externalId}/${tool.name}`,
        (occurrences.get(tool.name) ?? 0) > 1
          ? `server${row.index + 1}_${tool.name}`
          : tool.name,
      ]),
    ),
  );
}

function toolRowsOf({
  row,
  rows,
  allowedTools,
  confirmTools,
  confirmWrites,
}: {
  row: AgentServerRow;
  rows: AgentServerRow[];
  allowedTools: string[];
  confirmTools: string[];
  confirmWrites: boolean;
}): AgentToolRow[] {
  if (row.server === null) {
    return [];
  }
  const exposed = exposedNamesOf({ rows });
  return row.server.tools.map((tool) => {
    const key = exposed.get(`${row.externalId}/${tool.name}`) ?? tool.name;
    const lockedByWriteRule =
      confirmWrites && agentToolPolicy.looksLikeWrite(key);
    return {
      tool,
      key,
      allowed:
        allowedTools.length === 0 ||
        allowedTools.includes(key) ||
        allowedTools.includes(tool.name),
      confirm: lockedByWriteRule || confirmTools.includes(key),
      confirmLocked: lockedByWriteRule,
    };
  });
}

function allToolKeys({ rows }: { rows: AgentServerRow[] }): string[] {
  return [...exposedNamesOf({ rows }).values()];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function addServer({
  state,
  server,
  servers,
}: {
  state: AgentToolsState;
  server: McpServer;
  servers: McpServer[];
}): AgentToolsState {
  const entries = [
    ...state.entries,
    agentMcpServers.entryOf({ server: infoOf(server) }),
  ];
  if (state.allowedTools.length === 0) {
    return { ...state, entries };
  }
  const rows = resolveRows({ entries, servers });
  const newKeys = toolRowsOf({
    row: rows[rows.length - 1],
    rows,
    allowedTools: [],
    confirmTools: [],
    confirmWrites: false,
  }).map((toolRow) => toolRow.key);
  return {
    ...state,
    entries,
    allowedTools: unique([...state.allowedTools, ...newKeys]),
  };
}

function addManualEntry({
  state,
}: {
  state: AgentToolsState;
}): AgentToolsState {
  return {
    ...state,
    entries: [...state.entries, { server: null, url: '', authorization: '' }],
  };
}

function updateManualEntry({
  state,
  index,
  patch,
}: {
  state: AgentToolsState;
  index: number;
  patch: Partial<AgentMcpServerEntry>;
}): AgentToolsState {
  return {
    ...state,
    entries: state.entries.map((entry, position) =>
      position === index ? { ...entry, ...patch } : entry,
    ),
  };
}

function refreshEntry({
  state,
  index,
  server,
}: {
  state: AgentToolsState;
  index: number;
  server: McpServer;
}): AgentToolsState {
  return {
    ...state,
    entries: state.entries.map((entry, position) =>
      position === index
        ? agentMcpServers.entryOf({ server: infoOf(server) })
        : entry,
    ),
  };
}

function removeEntry({
  state,
  index,
  servers,
}: {
  state: AgentToolsState;
  index: number;
  servers: McpServer[];
}): AgentToolsState {
  const before = resolveRows({ entries: state.entries, servers });
  const entries = state.entries.filter((_, position) => position !== index);
  const after = resolveRows({ entries, servers });
  const keptKeys = new Set(allToolKeys({ rows: after }));
  const droppedKeys = allToolKeys({ rows: before }).filter(
    (key) => !keptKeys.has(key),
  );
  const hasLinkedLeft = after.some(
    (row) => row.kind === AgentServerRowKind.LINKED,
  );
  const allowedTools =
    hasLinkedLeft && state.allowedTools.length > 0
      ? state.allowedTools.filter((key) => !droppedKeys.includes(key))
      : [];
  return {
    entries,
    allowedTools: allowedTools.length === 0 ? [] : allowedTools,
    confirmTools: state.confirmTools.filter(
      (key) => !droppedKeys.includes(key),
    ),
  };
}

function canDisallow({
  state,
  servers,
  key,
}: {
  state: AgentToolsState;
  servers: McpServer[];
  key: string;
}): boolean {
  const rows = resolveRows({ entries: state.entries, servers });
  const hasManual = rows.some((row) => row.kind === AgentServerRowKind.MANUAL);
  if (hasManual) {
    return true;
  }
  const keys = allToolKeys({ rows });
  const allowed =
    state.allowedTools.length === 0
      ? keys
      : keys.filter((candidate) => state.allowedTools.includes(candidate));
  return allowed.some((candidate) => candidate !== key);
}

function setAllowed({
  state,
  servers,
  key,
  allowed,
}: {
  state: AgentToolsState;
  servers: McpServer[];
  key: string;
  allowed: boolean;
}): AgentToolsState {
  const rows = resolveRows({ entries: state.entries, servers });
  const keys = allToolKeys({ rows });
  const current = state.allowedTools.length === 0 ? keys : state.allowedTools;
  const next = allowed
    ? unique([...current, key])
    : current.filter((candidate) => candidate !== key);
  return { ...state, allowedTools: next };
}

function setConfirm({
  state,
  key,
  confirm,
}: {
  state: AgentToolsState;
  key: string;
  confirm: boolean;
}): AgentToolsState {
  return {
    ...state,
    confirmTools: confirm
      ? unique([...state.confirmTools, key])
      : state.confirmTools.filter((candidate) => candidate !== key),
  };
}

function allowEveryTool({
  state,
}: {
  state: AgentToolsState;
}): AgentToolsState {
  return { ...state, allowedTools: [] };
}

function stateOfInput({
  mcpServers,
  allowedTools,
  confirmTools,
}: {
  mcpServers: unknown;
  allowedTools: unknown;
  confirmTools: unknown;
}): AgentToolsState {
  return {
    entries: agentMcpServers.read(mcpServers),
    allowedTools: agentMcpServers.readNames(allowedTools),
    confirmTools: agentMcpServers.readNames(confirmTools),
  };
}

function toolSummary({ tool }: { tool: McpServerTool }): string {
  return tool.title !== undefined && tool.title !== tool.name
    ? tool.title
    : tool.name;
}

function entriesToInput({ state }: { state: AgentToolsState }): {
  mcpServers: { server?: string; url: string; authorization: string }[];
  allowedTools: string[];
  confirmTools: string[];
} {
  return {
    mcpServers: state.entries.map((entry) =>
      entry.server === null
        ? { url: entry.url, authorization: entry.authorization }
        : {
            server: entry.server,
            url: entry.url,
            authorization: entry.authorization,
          },
    ),
    allowedTools: state.allowedTools,
    confirmTools: state.confirmTools,
  };
}

export const agentToolsUtils = {
  infoOf,
  resolveRows,
  availableToAdd,
  toolRowsOf,
  addServer,
  addManualEntry,
  updateManualEntry,
  refreshEntry,
  removeEntry,
  canDisallow,
  setAllowed,
  setConfirm,
  allowEveryTool,
  stateOfInput,
  entriesToInput,
  toolSummary,
};

export enum AgentServerRowKind {
  LINKED = 'LINKED',
  MANUAL = 'MANUAL',
}

export enum AgentServerState {
  OK = 'OK',
  MISSING = 'MISSING',
  BROKEN = 'BROKEN',
  STALE = 'STALE',
}

export type AgentToolsState = {
  entries: AgentMcpServerEntry[];
  allowedTools: string[];
  confirmTools: string[];
};

export type AgentServerRow = {
  index: number;
  entry: AgentMcpServerEntry;
  kind: AgentServerRowKind;
  externalId: string | null;
  server: McpServer | null;
  state: AgentServerState;
};

export type AgentToolRow = {
  tool: McpServerTool;
  key: string;
  allowed: boolean;
  confirm: boolean;
  confirmLocked: boolean;
};
