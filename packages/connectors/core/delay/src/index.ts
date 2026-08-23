import { ConnectorAuth, createConnector } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { delayForAction } from './lib/actions/delay-for-action';
import { delayUntilAction } from './lib/actions/delay-until-action';

export const delay = createConnector({
  displayName: 'Delay',
  description: 'Use it to delay the execution of the next action',
  minimumSupportedRelease: '0.82.0',
  logoUrl: 'https://cdn.fema.local/connectors/new-core/delay.svg',
  authors: ["Nilesh","kishanprmr","MoShizzle","AbdulTheActiveConnectorr","khaledmashaly","abuaboud"],
  categories: [ConnectorCategory.CORE, ConnectorCategory.WORKFLOW_CONTROL],
  auth: ConnectorAuth.None(),
  actions: [
    delayForAction, // Delay for a fixed duration
    delayUntilAction, // Takes a timestamp parameter instead of duration
  ],
  triggers: [],
});
