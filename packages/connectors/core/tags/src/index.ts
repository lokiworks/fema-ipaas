import { createConnector, ConnectorAuth } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { addTag } from './lib/add-tag';

export const tags = createConnector({
  displayName: 'Tags',
  description: 'Add custom tags to your run for filtration',
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.30.0',
  logoUrl: '/assets/connectors/tags.svg',
  categories: [ConnectorCategory.CORE],
  authors: ["kishanprmr","MoShizzle","abuaboud"],
  actions: [addTag],
  triggers: [],
});
