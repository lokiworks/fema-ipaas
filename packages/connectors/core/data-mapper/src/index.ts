import { ConnectorAuth, createConnector } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { advancedMapping } from './lib/actions/advanced-mapping';

export const dataMapper = createConnector({
  displayName: 'Data Mapper',
  description: 'tools to manipulate data structure',

  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.fema.local/connectors/new-core/data-mapper.svg',
  auth: ConnectorAuth.None(),
  categories: [ConnectorCategory.CORE],
  authors: ["kishanprmr","MoShizzle","AbdulTheActiveConnectorr","khaledmashaly","abuaboud"],
  actions: [advancedMapping],
  triggers: [],
});
