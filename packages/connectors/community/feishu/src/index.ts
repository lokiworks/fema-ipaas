import { ConnectorCategory, createConnector } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from './lib/auth';
import { createBitableRecord } from './lib/actions/create-bitable-record';
import { findUser } from './lib/actions/find-user';
import { searchBitableRecords } from './lib/actions/search-bitable-records';
import { sendDirectMessage } from './lib/actions/send-direct-message';
import { sendGroupMessage } from './lib/actions/send-group-message';
import { eventReceived } from './lib/triggers/event-received';

export const feishu = createConnector({
  displayName: 'Feishu',
  description: 'Send Feishu messages, look up members, and read or write Bitable records',
  minimumSupportedRelease: '0.30.0',
  categories: [ConnectorCategory.COMMUNICATION, ConnectorCategory.PRODUCTIVITY],
  logoUrl: '/assets/connectors/feishu.svg',
  authors: ['lokiworks'],
  auth: feishuAuth,
  actions: [sendGroupMessage, sendDirectMessage, findUser, createBitableRecord, searchBitableRecords],
  triggers: [eventReceived],
});
