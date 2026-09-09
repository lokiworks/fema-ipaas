import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { feishuCommon } from '../common';

export const sendGroupMessage = createAction({
  auth: feishuAuth,
  name: 'send_group_message',
  displayName: 'Send Group Message',
  description: 'Send a message to a Feishu group chat the bot has joined',
  audience: 'both',
  classification: 'WRITE',
  aiMetadata: {
    description:
      'Send a message to a Feishu/Lark group chat the bot has been added to. Pick this for team notifications, alerts and digests that a whole group should see; use Send Direct Message instead when one specific person should receive it. The bot must already be a member of the target chat, and every call posts a new message, so retries duplicate.',
    idempotent: false,
  },
  props: {
    chatId: Property.Dropdown({
      displayName: 'Group Chat',
      description: 'Only chats the app bot has joined are listed. If the chat you want is missing, add the app to that chat first.',
      auth: feishuAuth,
      required: true,
      refreshers: [],
      options: async ({ auth }) => {
        if (!auth) {
          return { disabled: true, options: [], placeholder: 'Connect your Feishu app first' };
        }
        const data = await feishuCommon.callApi<ChatListResponse>({
          auth,
          method: HttpMethod.GET,
          path: '/open-apis/im/v1/chats',
          queryParams: { page_size: '100' },
        });
        const items = data.items ?? [];
        if (items.length === 0) {
          return { disabled: true, options: [], placeholder: 'The bot has not joined any group chat yet' };
        }
        return {
          disabled: false,
          options: items.map((chat) => ({ label: chat.name || chat.chat_id, value: chat.chat_id })),
        };
      },
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
    const { chatId, messageType, content } = context.propsValue;
    const data = await feishuCommon.callApi<SendMessageResponse>({
      auth: context.auth,
      method: HttpMethod.POST,
      path: '/open-apis/im/v1/messages',
      queryParams: { receive_id_type: 'chat_id' },
      body: {
        receive_id: chatId,
        msg_type: messageType,
        content: buildContent(messageType, content),
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

function buildContent(messageType: string, content: string): string {
  if (messageType === 'text') {
    return JSON.stringify({ text: content });
  }
  return content;
}

type ChatListResponse = { items?: { chat_id: string; name: string }[] };

type SendMessageResponse = {
  message_id: string;
  chat_id: string;
  msg_type: string;
  create_time: string;
};
