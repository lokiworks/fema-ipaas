import { LlmTool, McpTool } from '@fema-ipaas/connector-sdk';
import { McpSession } from './mcp-client';

export const agentToolbox = {
  build,
};

function build({
  servers,
  allowedTools,
}: {
  servers: ConnectedServer[];
  allowedTools: string[];
}): AgentToolbox {
  const occurrences = servers
    .flatMap((server) => server.tools.map((tool) => tool.name))
    .reduce<Map<string, number>>(
      (counts, name) => new Map([...counts, [name, (counts.get(name) ?? 0) + 1]]),
      new Map(),
    );
  const entries = servers.flatMap((server, index) =>
    server.tools.map((tool) => {
      const exposedName =
        (occurrences.get(tool.name) ?? 0) > 1 ? `server${index + 1}_${tool.name}` : tool.name;
      const allowed =
        allowedTools.length === 0 ||
        allowedTools.includes(tool.name) ||
        allowedTools.includes(exposedName);
      return { exposedName, tool, session: server.session, allowed };
    }),
  );
  return {
    tools: entries
      .filter((entry) => entry.allowed)
      .map((entry) => ({
        name: entry.exposedName,
        description: entry.tool.description,
        inputSchema: entry.tool.inputSchema,
      })),
    routes: new Map(
      entries.map((entry) => [
        entry.exposedName,
        { session: entry.session, name: entry.tool.name, allowed: entry.allowed },
      ]),
    ),
  };
}

export type ConnectedServer = {
  session: McpSession;
  tools: McpTool[];
};

export type ToolRoute = {
  session: McpSession;
  name: string;
  allowed: boolean;
};

export type AgentToolbox = {
  tools: LlmTool[];
  routes: Map<string, ToolRoute>;
};
