import {
  McpServer,
  McpServerAuthType,
  McpServerStatus,
  McpServerTransport,
  ConnectionStatus,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import {
  AgentServerRowKind,
  AgentServerState,
  agentToolsUtils,
} from '@/features/mcp-servers/utils/agent-tools-utils';

function server(
  overrides: Partial<McpServer> & { externalId: string },
): McpServer {
  return {
    id: `id-${overrides.externalId}`,
    connectionId: `conn-${overrides.externalId}`,
    created: '2026-10-04T00:00:00.000Z',
    updated: '2026-10-04T00:00:00.000Z',
    displayName: overrides.externalId,
    description: '',
    url: `https://${overrides.externalId}.corp/mcp`,
    transport: McpServerTransport.STREAMABLE_HTTP,
    authType: McpServerAuthType.BEARER,
    authConfigured: true,
    status: McpServerStatus.CONNECTED,
    connectionStatus: ConnectionStatus.ACTIVE,
    lastError: null,
    tools: [],
    lastSyncedAt: null,
    allProjects: true,
    projectIds: [],
    projects: [],
    ownerId: null,
    ownerName: null,
    myPermission: null,
    canManage: true,
    ...overrides,
  };
}

const hr = server({
  externalId: 'hr',
  displayName: '企业人事工具',
  tools: [
    {
      name: 'query_employee',
      title: '查询员工',
      description: '查员工',
      inputSchema: {},
    },
    {
      name: 'create_ticket',
      title: '创建工单',
      description: '建工单',
      inputSchema: {},
    },
    { name: 'archive_ticket', description: '归档', inputSchema: {} },
  ],
});
const open = server({
  externalId: 'open',
  displayName: '开放服务',
  authType: McpServerAuthType.NONE,
  tools: [{ name: 'ping', description: 'ping', inputSchema: {} }],
});
const empty = { entries: [], allowedTools: [], confirmTools: [] };

describe('agentToolsUtils.addServer', () => {
  it('writes the address and the authorization reference, so nothing is typed by hand', () => {
    const next = agentToolsUtils.addServer({
      state: empty,
      server: hr,
      servers: [hr, open],
    });
    expect(next.entries).toEqual([
      {
        server: 'hr',
        url: 'https://hr.corp/mcp',
        authorization: "{{connections['hr'].props.token}}",
      },
    ]);
    const second = agentToolsUtils.addServer({
      state: next,
      server: open,
      servers: [hr, open],
    });
    expect(second.entries[1]).toEqual({
      server: 'open',
      url: 'https://open.corp/mcp',
      authorization: '',
    });
  });

  it('allows the tools of a new server when a tool list is already in force', () => {
    const state = {
      ...empty,
      entries: [
        agentToolsUtils.addServer({
          state: empty,
          server: hr,
          servers: [hr, open],
        }).entries[0],
      ],
      allowedTools: ['query_employee'],
    };
    const next = agentToolsUtils.addServer({
      state,
      server: open,
      servers: [hr, open],
    });
    expect(next.allowedTools).toEqual(['query_employee', 'ping']);
  });

  it('keeps "all tools" as it is when no list is in force', () => {
    const next = agentToolsUtils.addServer({
      state: empty,
      server: hr,
      servers: [hr],
    });
    expect(next.allowedTools).toEqual([]);
  });
});

describe('agentToolsUtils.resolveRows', () => {
  const linked = agentToolsUtils.addServer({
    state: empty,
    server: hr,
    servers: [hr],
  });

  it('marks a picked server as fine while the entry matches it', () => {
    const [row] = agentToolsUtils.resolveRows({
      entries: linked.entries,
      servers: [hr],
    });
    expect(row).toMatchObject({
      kind: AgentServerRowKind.LINKED,
      state: AgentServerState.OK,
      externalId: 'hr',
    });
  });

  it('marks a deleted server as missing', () => {
    const [row] = agentToolsUtils.resolveRows({
      entries: linked.entries,
      servers: [open],
    });
    expect(row).toMatchObject({
      state: AgentServerState.MISSING,
      externalId: 'hr',
      server: null,
    });
  });

  it('marks a server whose connection is broken', () => {
    const broken = server({ ...hr, status: McpServerStatus.ERROR });
    const [row] = agentToolsUtils.resolveRows({
      entries: linked.entries,
      servers: [broken],
    });
    expect(row.state).toBe(AgentServerState.BROKEN);
  });

  it('notices when the server address changed after the step was set up', () => {
    const moved = server({ ...hr, url: 'https://hr-new.corp/mcp' });
    const [row] = agentToolsUtils.resolveRows({
      entries: linked.entries,
      servers: [moved],
    });
    expect(row.state).toBe(AgentServerState.STALE);
    const refreshed = agentToolsUtils.refreshEntry({
      state: linked,
      index: 0,
      server: moved,
    });
    expect(refreshed.entries[0].url).toBe('https://hr-new.corp/mcp');
  });

  it('keeps hand-written addresses as manual rows, and links old entries by their reference', () => {
    const rows = agentToolsUtils.resolveRows({
      entries: [
        {
          server: null,
          url: 'https://elsewhere/mcp',
          authorization: 'Bearer abc',
        },
        {
          server: null,
          url: 'https://old/mcp',
          authorization: "{{connections['hr'].props.token}}",
        },
      ],
      servers: [hr],
    });
    expect(rows[0].kind).toBe(AgentServerRowKind.MANUAL);
    expect(rows[1]).toMatchObject({
      kind: AgentServerRowKind.LINKED,
      externalId: 'hr',
      state: AgentServerState.STALE,
    });
  });
});

describe('agentToolsUtils.availableToAdd', () => {
  it('offers only servers that are not on the step yet', () => {
    const state = agentToolsUtils.addServer({
      state: empty,
      server: hr,
      servers: [hr, open],
    });
    expect(
      agentToolsUtils
        .availableToAdd({ entries: state.entries, servers: [hr, open] })
        .map((item) => item.externalId),
    ).toEqual(['open']);
  });
});

describe('agentToolsUtils.toolRowsOf', () => {
  const state = agentToolsUtils.addServer({
    state: empty,
    server: hr,
    servers: [hr],
  });
  const [row] = agentToolsUtils.resolveRows({
    entries: state.entries,
    servers: [hr],
  });

  it('shows every tool as allowed while no tool list is in force', () => {
    const tools = agentToolsUtils.toolRowsOf({
      row,
      rows: [row],
      allowedTools: [],
      confirmTools: [],
      confirmWrites: true,
    });
    expect(tools.map((item) => item.allowed)).toEqual([true, true, true]);
  });

  it('locks the confirmation of write-like tools while "ask before writes" is on, exactly as the agent decides', () => {
    const tools = agentToolsUtils.toolRowsOf({
      row,
      rows: [row],
      allowedTools: [],
      confirmTools: [],
      confirmWrites: true,
    });
    expect(
      tools.map((item) => [item.tool.name, item.confirm, item.confirmLocked]),
    ).toEqual([
      ['query_employee', false, false],
      ['create_ticket', true, true],
      ['archive_ticket', false, false],
    ]);
  });

  it('frees the write-like tools when "ask before writes" is off, and honours the listed ones', () => {
    const tools = agentToolsUtils.toolRowsOf({
      row,
      rows: [row],
      allowedTools: [],
      confirmTools: ['archive_ticket'],
      confirmWrites: false,
    });
    expect(
      tools.map((item) => [item.tool.name, item.confirm, item.confirmLocked]),
    ).toEqual([
      ['query_employee', false, false],
      ['create_ticket', false, false],
      ['archive_ticket', true, false],
    ]);
  });

  it('names a tool shared by two servers the way the agent does', () => {
    const other = server({
      externalId: 'crm',
      tools: [{ name: 'query_employee', description: '', inputSchema: {} }],
    });
    const both = agentToolsUtils.addServer({
      state,
      server: other,
      servers: [hr, other],
    });
    const rows = agentToolsUtils.resolveRows({
      entries: both.entries,
      servers: [hr, other],
    });
    const first = agentToolsUtils.toolRowsOf({
      row: rows[0],
      rows,
      allowedTools: [],
      confirmTools: [],
      confirmWrites: true,
    });
    const second = agentToolsUtils.toolRowsOf({
      row: rows[1],
      rows,
      allowedTools: [],
      confirmTools: [],
      confirmWrites: true,
    });
    expect(first[0].key).toBe('server1_query_employee');
    expect(second[0].key).toBe('server2_query_employee');
    expect(first[1].key).toBe('create_ticket');
  });
});

describe('agentToolsUtils tool switches', () => {
  const base = agentToolsUtils.addServer({
    state: empty,
    server: hr,
    servers: [hr, open],
  });
  const both = agentToolsUtils.addServer({
    state: base,
    server: open,
    servers: [hr, open],
  });

  it('turning one tool off writes the list of the others, because an empty list would allow everything', () => {
    const next = agentToolsUtils.setAllowed({
      state: both,
      servers: [hr, open],
      key: 'archive_ticket',
      allowed: false,
    });
    expect(next.allowedTools).toEqual([
      'query_employee',
      'create_ticket',
      'ping',
    ]);
  });

  it('turning it on again adds it back', () => {
    const off = agentToolsUtils.setAllowed({
      state: both,
      servers: [hr, open],
      key: 'archive_ticket',
      allowed: false,
    });
    const on = agentToolsUtils.setAllowed({
      state: off,
      servers: [hr, open],
      key: 'archive_ticket',
      allowed: true,
    });
    expect(on.allowedTools).toContain('archive_ticket');
  });

  it('refuses to turn off the last allowed tool, since the agent needs at least one', () => {
    const only = { ...both, allowedTools: ['ping'] };
    expect(
      agentToolsUtils.canDisallow({
        state: only,
        servers: [hr, open],
        key: 'ping',
      }),
    ).toBe(false);
    expect(
      agentToolsUtils.canDisallow({
        state: both,
        servers: [hr, open],
        key: 'ping',
      }),
    ).toBe(true);
  });

  it('adds and removes tools that always need a person', () => {
    const on = agentToolsUtils.setConfirm({
      state: both,
      key: 'query_employee',
      confirm: true,
    });
    expect(on.confirmTools).toEqual(['query_employee']);
    expect(
      agentToolsUtils.setConfirm({
        state: on,
        key: 'query_employee',
        confirm: false,
      }).confirmTools,
    ).toEqual([]);
  });

  it('allowing every tool clears the list', () => {
    const limited = { ...both, allowedTools: ['ping'] };
    expect(
      agentToolsUtils.allowEveryTool({ state: limited }).allowedTools,
    ).toEqual([]);
  });
});

describe('agentToolsUtils.removeEntry', () => {
  it('drops the tools of the removed server from both lists and keeps the others', () => {
    const base = agentToolsUtils.addServer({
      state: empty,
      server: hr,
      servers: [hr, open],
    });
    const both = agentToolsUtils.addServer({
      state: base,
      server: open,
      servers: [hr, open],
    });
    const state = {
      ...both,
      allowedTools: ['query_employee', 'ping'],
      confirmTools: ['query_employee', 'ping'],
    };
    const next = agentToolsUtils.removeEntry({
      state,
      index: 0,
      servers: [hr, open],
    });
    expect(next.entries.map((entry) => entry.server)).toEqual(['open']);
    expect(next.allowedTools).toEqual(['ping']);
    expect(next.confirmTools).toEqual(['ping']);
  });

  it('goes back to "all tools" when the list would end up empty', () => {
    const base = agentToolsUtils.addServer({
      state: empty,
      server: hr,
      servers: [hr, open],
    });
    const both = agentToolsUtils.addServer({
      state: base,
      server: open,
      servers: [hr, open],
    });
    const state = { ...both, allowedTools: ['query_employee'] };
    const next = agentToolsUtils.removeEntry({
      state,
      index: 0,
      servers: [hr, open],
    });
    expect(next.allowedTools).toEqual([]);
  });
});

describe('agentToolsUtils input conversion', () => {
  it('round-trips the stored step input, leaving the server key out of hand-written entries', () => {
    const state = agentToolsUtils.stateOfInput({
      mcpServers: [
        {
          server: 'hr',
          url: 'https://hr.corp/mcp',
          authorization: "{{connections['hr'].props.token}}",
        },
        { url: 'https://elsewhere/mcp', authorization: 'Bearer abc' },
      ],
      allowedTools: ['query_employee'],
      confirmTools: ['archive_ticket'],
    });
    expect(agentToolsUtils.entriesToInput({ state })).toEqual({
      mcpServers: [
        {
          server: 'hr',
          url: 'https://hr.corp/mcp',
          authorization: "{{connections['hr'].props.token}}",
        },
        { url: 'https://elsewhere/mcp', authorization: 'Bearer abc' },
      ],
      allowedTools: ['query_employee'],
      confirmTools: ['archive_ticket'],
    });
  });
});
