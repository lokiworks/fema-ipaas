import { createConnector } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { callTool } from './lib/actions/call-tool';
import { listTools } from './lib/actions/list-tools';
import { testServer } from './lib/actions/test-server';
import { mcpAuth } from './lib/auth';

export const mcp = createConnector({
  displayName: 'MCP server',
  description: 'Call the tools of an external MCP server',
  minimumSupportedRelease: '0.30.0',
  logoUrl: '/assets/connectors/mcp.svg',
  auth: mcpAuth,
  categories: [ConnectorCategory.ARTIFICIAL_INTELLIGENCE, ConnectorCategory.DEVELOPER_TOOLS],
  authors: ['lokiworks'],
  actions: [callTool, listTools, testServer],
  triggers: [],
});
