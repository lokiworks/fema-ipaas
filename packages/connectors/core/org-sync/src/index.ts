import { resolveOperation } from './lib/actions/resolve-operation';
import { ConnectorAuth, ConnectorCategory, createConnector } from '@fema-ipaas/connector-sdk';
import { planTreeSync } from './lib/actions/plan-tree-sync';

export const orgSync = createConnector({
  displayName: 'Organization Sync', description: 'Plan safe changes to a department tree',
  logoUrl: '/assets/connectors/org-sync.svg', auth: ConnectorAuth.None(),
  categories: [ConnectorCategory.CORE], authors: ['lokiworks'], actions: [planTreeSync, resolveOperation], triggers: [],
});
