import { ConnectorCategory, createConnector } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from './lib/auth';
import { createBitableRecord } from './lib/actions/create-bitable-record';
import { findUser } from './lib/actions/find-user';
import { provisionUser } from './lib/actions/provision-user';
import { resumeUser } from './lib/actions/resume-user';
import { searchBitableRecords } from './lib/actions/search-bitable-records';
import { sendDirectMessage } from './lib/actions/send-direct-message';
import { sendGroupMessage } from './lib/actions/send-group-message';
import { suspendUser } from './lib/actions/suspend-user';
import { updateUser } from './lib/actions/update-user';
import { eventReceived } from './lib/triggers/event-received';

export const feishu = createConnector({
  displayName: 'Feishu',
  description: 'Send Feishu messages, look up and onboard members, and read or write Bitable records',
  minimumSupportedRelease: '0.30.0',
  categories: [ConnectorCategory.COMMUNICATION, ConnectorCategory.PRODUCTIVITY],
  logoUrl: '/assets/connectors/feishu.svg',
  authors: ['lokiworks'],
  auth: feishuAuth,
  actions: [
    sendGroupMessage,
    sendDirectMessage,
    findUser,
    provisionUser,
    updateUser,
    suspendUser,
    resumeUser,
    createBitableRecord,
    searchBitableRecords,
  ],
  triggers: [eventReceived],
});
