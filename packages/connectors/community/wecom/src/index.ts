import { ConnectorCategory, createConnector } from '@fema-ipaas/connector-sdk';
import { wecomActions } from './lib/actions';
import { wecomAuth } from './lib/auth';
import { contactChanged } from './lib/triggers/contact-changed';

export const wecom = createConnector({ displayName: 'WeCom', description: 'Synchronize members and departments, receive contact changes and send messages', logoUrl: '/assets/connectors/wecom.svg', authors: ['lokiworks'], categories: [ConnectorCategory.COMMUNICATION], auth: wecomAuth, actions: wecomActions, triggers: [contactChanged] });
