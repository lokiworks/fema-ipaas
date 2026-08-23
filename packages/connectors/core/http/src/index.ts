import { ConnectorAuth, createConnector, ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { httpSendRequestAction } from './lib/actions/send-http-request-action';
import { parseUrl } from './lib/actions/parse-url';

export const http = createConnector({
  displayName: 'HTTP',
  description: 'Sends HTTP requests and return responses',
  logoUrl: 'https://cdn.fema.local/connectors/new-core/http.svg',
  categories: [ConnectorCategory.CORE],
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.20.3',
  actions: [httpSendRequestAction, parseUrl],
  authors: [
    'bibhuty-did-this',
    'landonmoir',
    'JanHolger',
    'Salem-Alaa',
    'kishanprmr',
    'AbdulTheActiveConnectorr',
    'khaledmashaly',
    'abuaboud',
    'pfernandez98',
  ],
  triggers: [],
});
