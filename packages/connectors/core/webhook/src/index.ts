import { createConnector, ConnectorAuth } from '@fema-ipaas/connector-sdk';
import { catchWebhook } from './lib/triggers/catch-hook';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { returnResponse } from './lib/actions/return-response';
import { returnResponseAndWaitForNextWebhook } from './lib/actions/return-response-and-wait-for-next-webhook';

export const webhook = createConnector({
  displayName: 'Webhook',
  description: 'Receive HTTP requests and trigger workflows using unique URLs.',
  auth: ConnectorAuth.None(),
  categories: [ConnectorCategory.CORE],
  minimumSupportedRelease: '0.82.0',
  logoUrl: 'https://cdn.fema.local/connectors/new-core/webhooks.svg',
  authors: ['abuaboud', 'pfernandez98', 'kishanprmr','AbdulTheActiveConnectorr'],
  actions: [returnResponse,returnResponseAndWaitForNextWebhook],
  triggers: [catchWebhook],
});
