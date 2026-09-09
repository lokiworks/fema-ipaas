import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { feishuCommon } from '../common';

export const sendDirectMessage = createAction({
  auth: feishuAuth,
  name: 'send_direct_message',
  displayName: 'Send Direct Message',
  description: 'Send a one-to-one Feishu message addressed by email or user ID',
  audience: 'both',
  classification: 'WRITE',
  aiMetadata: {
    description:
      'Send a one-to-one Feishu/Lark message to a single person, addressed by work email or open_id. Pick this over Send Group Message when the message is meant for one individual, such as an approval request or a personal reminder. The recipient must belong to the same tenant as the app, and every call posts a new message, so retries duplicate.',
    idempotent: false,
  },
  props: {
    receiveIdType: Property.StaticDropdown({
      displayName: 'Recipient Identifier',
      required: true,
      defaultValue: 'email',
      options: {
        options: [
          { label: 'Work email', value: 'email' },
          { label: 'open_id', value: 'open_id' },
          { label: 'Tenant user_id', value: 'user_id' },
        ],
      },
    }),
    receiveId: Property.ShortText({
      displayName: 'Recipient',
      description: 'Matches the identifier chosen above, for example zhangsan@example.com.',
      required: true,
    }),
    messageType: Property.StaticDropdown({
      displayName: 'Message Type',
      required: true,
      defaultValue: 'text',
      options: {
        options: [
          { label: 'Plain text', value: 'text' },
          { label: 'Message card (JSON)', value: 'interactive' },
        ],
      },
    }),
    content: Property.LongText({
      displayName: 'Content',
      description:
        'For plain text, write the message body. For a message card, paste the Feishu card JSON produced by the card builder.',
      required: true,
    }),
  },
  async run(context) {
    const { receiveIdType, receiveId, messageType, content } = context.propsValue;
    const data = await feishuCommon.callApi<SendMessageResponse>({
      auth: context.auth,
      method: HttpMethod.POST,
      path: '/open-apis/im/v1/messages',
      queryParams: { receive_id_type: receiveIdType },
      body: {
        receive_id: receiveId,
        msg_type: messageType,
        content: messageType === 'text' ? JSON.stringify({ text: content }) : content,
      },
    });
    return {
      message_id: data.message_id,
      chat_id: data.chat_id,
      message_type: data.msg_type,
      created_at: data.create_time,
    };
  },
});

type SendMessageResponse = {
  message_id: string;
  chat_id: string;
  msg_type: string;
  create_time: string;
};
