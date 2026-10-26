import { enterpriseCallbacks } from '@fema-ipaas/connector-common';
import { createTrigger, isObject, Property, TriggerStrategy, tryCatch, WebhookHandshakeStrategy } from '@fema-ipaas/connector-sdk';
import { dingtalkAuth } from '../auth';
import { dingtalkContacts } from '../common/contacts';
import { dingtalkCommon } from '../common';

export const contactChanged = createTrigger({
  auth: dingtalkAuth, name: 'contact_changed', displayName: 'Contact changed', description: 'Verify and decrypt HTTP event subscriptions, acknowledge immediately and then read current member state', classification: 'READ', type: TriggerStrategy.WEBHOOK, reliability: { rateLimits: [{ bucket: 'dingtalk-read', scope: 'APP_ENDPOINT', perSecond: 10 }] }, handshakeConfiguration: { strategy: WebhookHandshakeStrategy.ALWAYS },
  props: { setup: Property.MarkDown({ value: 'In Development management → Event subscriptions, select HTTP and paste this URL. Subscribe to user_add_org, user_modify_org, user_leave_org and department events. The callback owner key for console subscriptions is the App Key.\n\n{{webhookUrl}}' }), token: Property.ShortText({ displayName: 'Callback Token', required: true }), encodingKey: Property.ShortText({ displayName: 'EncodingAESKey', required: true }) }, sampleData: { eventId: 'user_modify_org:employee-1:1720000000', userid: 'employee-1', current: { userid: 'employee-1' } },
  async onEnable() {}, async onDisable() {},
  async onHandshake(context) {
    const query = context.payload.queryParams;
    const body = context.payload.body;
    const decrypted = await tryCatch(async () => { const plain = enterpriseCallbacks.decrypt({ token: context.propsValue.token, encodingKey: context.propsValue.encodingKey, receiver: context.auth.props.appKey, signature: query['signature'] ?? '', timestamp: query['timestamp'] ?? '', nonce: query['nonce'] ?? '', encrypted: isObject(body) && typeof body['encrypt'] === 'string' ? body['encrypt'] : '' }); const event: unknown = JSON.parse(plain); if (!isObject(event)) throw new Error('Invalid callback'); return event; });
    if (decrypted.error) return { status: 401, body: { error: 'Invalid callback signature' } };
    return { status: 200, body: enterpriseCallbacks.encrypt({ token: context.propsValue.token, encodingKey: context.propsValue.encodingKey, receiver: context.auth.props.appKey, text: 'success' }), continueToRun: decrypted.data['EventType'] !== 'check_url', triggerPayload: { body: decrypted.data, headers: {}, queryParams: {}, method: 'POST' } };
  },
  async run(context) {
    const body = context.payload.body;
    if (!isObject(body) || typeof body['EventType'] !== 'string') return [];
    const userIds = body['UserId'];
    if (!Array.isArray(userIds) || !userIds.every((value) => typeof value === 'string')) return [{ eventId: `${body['EventType']}:${String(body['TimeStamp'])}`, event: body }];
    const events = [];
    for (const userid of userIds) {
      const current = await tryCatch(() => dingtalkContacts.get({ auth: context.auth.props, rateLimit: context.rateLimit, userid }));
      if (current.error && !dingtalkCommon.missing(current.error)) throw current.error;
      events.push({ eventId: `${body['EventType']}:${userid}:${String(body['TimeStamp'])}`, userid, changeType: body['EventType'], current: current.data });
    }
    return events;
  },
});
