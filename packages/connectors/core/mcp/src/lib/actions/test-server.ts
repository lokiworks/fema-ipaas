import { createAction } from '@fema-ipaas/connector-sdk';
import { mcpAuth } from '../auth';
import { mcpProbe } from '../common/mcp-probe';
import { mcpTarget } from '../common/mcp-target';

export const testServer = createAction({
  auth: mcpAuth,
  name: 'test_server',
  displayName: 'Test server connection',
  description: 'Check that the worker can reach the MCP server and read its tool list',
  classification: 'READ',
  aiMetadata: {
    description:
      'Connects to the MCP server from the worker, lists its tools and reports the latency, or explains why the connection failed (loopback address, cloud metadata address, unreachable private network, DNS, transport mismatch, invalid token or missing OAuth authorization). Read-only.',
    idempotent: true,
  },
  errorHandlingOptions: {
    retryOnFailure: { defaultValue: false, hide: true },
    continueOnFailure: {},
  },
  props: {},
  async run(context) {
    return mcpProbe.probe({ target: mcpTarget.fromAuth(context.auth) });
  },
});
