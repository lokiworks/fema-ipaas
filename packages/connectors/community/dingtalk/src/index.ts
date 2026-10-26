import { ConnectorCategory, createConnector } from '@fema-ipaas/connector-sdk';
import { dingtalkActions } from './lib/actions';
import { dingtalkAuth } from './lib/auth';
import { contactChanged } from './lib/triggers/contact-changed';

export const dingtalk = createConnector({ displayName: 'DingTalk', description: 'Synchronize members and departments, receive contact callbacks and send work notices', logoUrl: '/assets/connectors/dingtalk.svg', authors: ['lokiworks'], categories: [ConnectorCategory.COMMUNICATION], auth: dingtalkAuth, actions: dingtalkActions, triggers: [contactChanged] });
