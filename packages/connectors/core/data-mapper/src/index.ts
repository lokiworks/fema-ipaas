import { getMappingValue } from './lib/actions/get-mapping-value';
import { getMappingRows } from './lib/actions/get-mapping-rows';
import { ConnectorAuth, createConnector } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { advancedMapping } from './lib/actions/advanced-mapping';
import { upsertMappingRows } from './lib/actions/upsert-mapping-rows';
import { mapFields } from './lib/actions/map-fields';

export const dataMapper = createConnector({
  displayName: 'Data Mapper',
  description: 'tools to manipulate data structure',

  minimumSupportedRelease: '0.30.0',
  logoUrl: '/assets/connectors/data-mapper.svg',
  auth: ConnectorAuth.None(),
  categories: [ConnectorCategory.CORE],
  authors: ["kishanprmr","MoShizzle","AbdulTheActiveConnectorr","khaledmashaly","abuaboud"],
  actions: [getMappingValue, getMappingRows, mapFields, advancedMapping, upsertMappingRows],
  triggers: [],
});
