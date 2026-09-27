import { createConnector } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { askModel } from './lib/actions/ask-model';
import { runAgent } from './lib/actions/run-agent';
import { aiAuth } from './lib/auth';

export const ai = createConnector({
  displayName: 'AI',
  description: 'Ask a large language model, or run an agent that calls MCP tools',
  minimumSupportedRelease: '0.30.0',
  logoUrl: '/assets/connectors/ai.svg',
  auth: aiAuth,
  categories: [ConnectorCategory.UNIVERSAL_AI, ConnectorCategory.ARTIFICIAL_INTELLIGENCE],
  authors: ['lokiworks'],
  actions: [askModel, runAgent],
  triggers: [],
});
