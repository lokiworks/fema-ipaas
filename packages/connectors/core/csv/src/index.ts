import { ConnectorAuth, createConnector } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { csvToJsonAction } from './lib/actions/convert-csv-to-json';
import { jsonToCsvAction } from './lib/actions/convert-json-to-csv';
import { excelToCsvAction } from './lib/actions/convert-excel-to-csv';

export const csv = createConnector({
  displayName: 'CSV',
  description: 'Manipulate CSV text',
  minimumSupportedRelease: '0.30.0',
  logoUrl: '/assets/connectors/csv.svg',
  auth: ConnectorAuth.None(),
  categories: [ConnectorCategory.CORE],
  actions: [csvToJsonAction, jsonToCsvAction, excelToCsvAction],
  authors: ["kishanprmr", "MoShizzle", "khaledmashaly", "abuaboud", 'sanket-a11y'],
  triggers: [],
});
