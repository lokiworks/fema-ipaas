import { ConnectorAuth, createConnector } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { readConnection } from './lib/actions/read-connection';

export const connections = createConnector({
  displayName: 'Connections',
  description: 'Read connections dynamically',
  minimumSupportedRelease: '0.36.1',
  logoUrl: '/assets/connectors/connections.svg',
  categories: [ConnectorCategory.CORE],
  auth: ConnectorAuth.None(),
  authors: ["kishanprmr","AbdulTheActiveConnectorr","khaledmashaly","abuaboud"],
  actions: [readConnection],
  triggers: [],
});
