import { ConnectorAuth, Property } from '@fema-ipaas/connector-sdk';
import { mcpProbe } from './common/mcp-probe';
import { mcpTarget } from './common/mcp-target';

export const mcpAuth = [
  ConnectorAuth.CustomAuth({
    displayName: 'MCP server',
    description: 'One connection is one external MCP server reached over Streamable HTTP or SSE',
    required: true,
    props: {
      url: Property.ShortText({
        displayName: 'Server URL',
        description: 'The endpoint of the MCP server, e.g. https://example.com/mcp',
        required: true,
      }),
      transport: Property.StaticDropdown({
        displayName: 'Transport',
        description: 'Streamable HTTP is the current protocol; SSE is the legacy one some servers still use',
        required: false,
        defaultValue: 'streamable_http',
        options: {
          disabled: false,
          options: [
            { label: 'Streamable HTTP', value: 'streamable_http' },
            { label: 'SSE (legacy)', value: 'sse' },
          ],
        },
      }),
      authType: Property.StaticDropdown({
        displayName: 'Authentication',
        description: 'Choose None only for servers that sit inside a network with its own access control',
        required: false,
        defaultValue: 'bearer',
        options: {
          disabled: false,
          options: [
            { label: 'None', value: 'none' },
            { label: 'Bearer token', value: 'bearer' },
          ],
        },
      }),
      token: ConnectorAuth.SecretText({
        displayName: 'Access token',
        description: 'Sent as the Authorization header; "Bearer " is added when missing',
        required: false,
      }),
    },
    validate: async ({ auth }) => {
      const result = await mcpProbe.probe({ target: mcpTarget.fromAuth({ props: auth }) });
      if (!result.ok) {
        return { valid: false, error: `${result.error.failure}: ${result.error.detail}` };
      }
      return { valid: true };
    },
  }),
  ConnectorAuth.OAuth2({
    displayName: 'MCP server (OAuth 2.0)',
    description: 'An MCP server that signs users in with OAuth 2.0',
    required: true,
    authUrl: '{authUrl}',
    tokenUrl: '{tokenUrl}',
    scope: [],
    pkce: true,
    pkceMethod: 'S256',
    props: {
      url: Property.ShortText({
        displayName: 'Server URL',
        description: 'The endpoint of the MCP server, e.g. https://example.com/mcp',
        required: true,
      }),
      transport: Property.StaticDropdown({
        displayName: 'Transport',
        description: 'Streamable HTTP is the current protocol; SSE is the legacy one some servers still use',
        required: true,
        defaultValue: 'streamable_http',
        options: {
          disabled: false,
          options: [
            { label: 'Streamable HTTP', value: 'streamable_http' },
            { label: 'SSE (legacy)', value: 'sse' },
          ],
        },
      }),
      authUrl: Property.ShortText({
        displayName: 'Authorization URL',
        required: true,
      }),
      tokenUrl: Property.ShortText({
        displayName: 'Token URL',
        required: true,
      }),
    },
  }),
];
