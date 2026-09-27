import { ConnectorAuth, Property, tryCatch } from '@fema-ipaas/connector-sdk';
import { mcpClient } from './common/mcp-client';

export const mcpAuth = ConnectorAuth.CustomAuth({
  displayName: 'MCP server',
  description: 'One connection is one external MCP server reachable over Streamable HTTP',
  required: true,
  props: {
    url: Property.ShortText({
      displayName: 'Server URL',
      description: 'The Streamable HTTP endpoint of the MCP server, e.g. https://example.com/mcp',
      required: true,
    }),
    token: ConnectorAuth.SecretText({
      displayName: 'Access token',
      description: 'Optional. Sent as the Authorization header; "Bearer " is added when missing',
      required: false,
    }),
  },
  validate: async ({ auth }) => {
    const { error } = await tryCatch(async () => {
      const session = await mcpClient.connect({ url: auth.url, authorization: auth.token });
      return mcpClient.listTools({ session });
    });
    if (error !== null) {
      return { valid: false, error: error.message };
    }
    return { valid: true };
  },
});
