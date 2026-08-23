import { ConnectorAuth, createConnector } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { convertJsonToXml } from './lib/actions/convert-json-to-xml';
import { convertXmlToJson } from './lib/actions/convert-xml-to-json';

export const xml = createConnector({
  displayName: 'XML',
  description: 'Extensible Markup Language for storing and transporting data',

  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.fema.local/connectors/xml.png',
  categories: [ConnectorCategory.CORE],
  auth: ConnectorAuth.None(),
  authors: ["Willianwg","kishanprmr","AbdulTheActiveConnectorr","khaledmashaly","abuaboud"],
  actions: [convertJsonToXml, convertXmlToJson],
  triggers: [],
});
