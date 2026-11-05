import { ConnectorCategory, createConnector } from '@fema-ipaas/connector-sdk';

import { callApi } from './lib/actions/call-api';
import { readObject } from './lib/actions/read-object';
import { femaAuth } from './lib/auth';
import { businessEvent } from './lib/triggers/business-event';

export const fema = createConnector({
  displayName: 'FEMA',
  description: 'Start workflows from FEMA business events and read or call FEMA as your tenant service application',
  minimumSupportedRelease: '0.30.0',
  categories: [ConnectorCategory.PRODUCTIVITY],
  logoUrl: '/assets/connectors/fema.svg',
  authors: ['lokiworks'],
  auth: femaAuth,
  actions: [readObject, callApi],
  triggers: [businessEvent],
});
