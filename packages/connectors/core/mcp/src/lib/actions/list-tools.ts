import { createAction } from '@fema-ipaas/connector-sdk';
import { mcpAuth } from '../auth';
import { mcpClient } from '../common/mcp-client';
import { mcpSession } from '../common/mcp-session';

export const listTools = createAction({
  auth: mcpAuth,
  name: 'list_tools',
  displayName: 'List tools',
  description: 'List the tools the MCP server offers, with their input schemas',
  classification: 'READ',
  aiMetadata: {
    description:
      'Returns the name, description and input schema of every tool the connected MCP server offers. Read-only.',
    idempotent: true,
  },
  props: {},
  async run(context) {
    const tools = await mcpSession.run({ auth: context.auth, fn: (session) => mcpClient.listTools({ session }) });
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  },
});
