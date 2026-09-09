import {
  Property,
  TriggerStrategy,
  WebhookHandshakeStrategy,
  createTrigger,
} from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { eventPayload } from '../event-payload';

export const eventReceived = createTrigger({
  auth: feishuAuth,
  name: 'event_received',
  displayName: 'New Event',
  description: 'Starts the workflow when Feishu pushes a subscribed event',
  classification: 'READ',
  aiMetadata: {
    description:
      'Start a workflow when Feishu pushes a subscribed event, such as a message sent to the bot or an employee joining or leaving. Pick this to react to something happening inside Feishu rather than polling for it. The request URL has to be pasted into the Feishu Open Platform console by hand, because a custom app cannot register its own subscription through the API.',
  },
  type: TriggerStrategy.WEBHOOK,
  handshakeConfiguration: {
    strategy: WebhookHandshakeStrategy.BODY_PARAM_PRESENT,
    paramName: 'challenge',
  },
  props: {
    setup: Property.MarkDown({
      value:
        'Open the Feishu Open Platform, pick your app, go to Events & Callbacks and paste this address as the request URL:\n\n```text\n{{webhookUrl}}\n```\n\nSave it, subscribe to the events you need, then copy the Verification Token below. Fill in the Encrypt Key only if your app has encryption switched on.',
    }),
    verificationToken: Property.ShortText({
      displayName: 'Verification Token',
      description: 'Shown next to the request URL in the Events & Callbacks page.',
      required: true,
    }),
    encryptKey: Property.ShortText({
      displayName: 'Encrypt Key',
      description: 'Leave empty unless encryption is switched on for this app.',
      required: false,
    }),
    eventType: Property.ShortText({
      displayName: 'Event Type',
      description:
        'Only pass through this event type, for example im.message.receive_v1. Leave empty to accept every subscribed event.',
      required: false,
    }),
  },
  sampleData: {
    schema: '2.0',
    header: {
      event_id: 'f7984f25b90c4cb0b7e5e4f0f1c6e2a1',
      event_type: 'im.message.receive_v1',
      create_time: '1757000000000',
      tenant_key: '2ca1d211f64f6438',
      app_id: 'cli_a1b2c3d4e5f6g7h8',
    },
    event: {
      sender: { sender_id: { open_id: 'ou_777' }, sender_type: 'user' },
      message: {
        message_id: 'om_123',
        chat_id: 'oc_1',
        message_type: 'text',
        content: '{"text":"deploy finished"}',
      },
    },
  },
  async onHandshake(context) {
    const body = eventPayload.decode({
      payload: context.payload.body,
      encryptKey: context.propsValue.encryptKey,
    });
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { challenge: eventPayload.challenge(body) },
    };
  },
  async onEnable() {
    return;
  },
  async onDisable() {
    return;
  },
  async run(context) {
    const body = eventPayload.decode({
      payload: context.payload.body,
      encryptKey: context.propsValue.encryptKey,
    });
    if (eventPayload.token(body) !== context.propsValue.verificationToken) {
      return [];
    }
    const wanted = context.propsValue.eventType;
    if (wanted && eventPayload.eventType(body) !== wanted) {
      return [];
    }
    return [body];
  },
});
