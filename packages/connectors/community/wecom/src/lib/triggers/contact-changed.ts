import { enterpriseCallbacks } from '@fema-ipaas/connector-common';
import { createTrigger, Property, TriggerStrategy, tryCatch, WebhookHandshakeStrategy } from '@fema-ipaas/connector-sdk';
import { wecomAuth } from '../auth';
import { wecomContacts } from '../common/contacts';
import { wecomCommon } from '../common';

export const contactChanged = createTrigger({
  auth: wecomAuth, name: 'contact_changed', displayName: 'Contact changed', description: 'Verify and decrypt directory callbacks, then read the current member state', classification: 'READ', type: TriggerStrategy.WEBHOOK,
  reliability: { rateLimits: [{ bucket: 'wecom-read', scope: 'APP_ENDPOINT', perSecond: 10 }] },
  handshakeConfiguration: { strategy: WebhookHandshakeStrategy.ALWAYS },
  props: {
    setup: Property.MarkDown({ value: 'In Management tools → Contact synchronization → Receive events, paste this URL and the Token and EncodingAESKey below. The server must be reachable over HTTPS.\n\n{{webhookUrl}}' }),
    token: Property.ShortText({ displayName: 'Callback Token', required: true }), encodingKey: Property.ShortText({ displayName: 'EncodingAESKey', required: true }),
  },
  sampleData: { eventId: 'create_user:employee-1:1720000000', changeType: 'create_user', userid: 'employee-1', current: { userid: 'employee-1' } },
  async onEnable() {}, async onDisable() {},
  async onHandshake(context) {
    const query = context.payload.queryParams;
    const handshake = typeof query['echostr'] === 'string';
    const xml = typeof context.payload.body === 'string' ? context.payload.body : typeof context.payload.rawBody === 'string' ? context.payload.rawBody : '';
    const { data: plain, error } = await tryCatch(async () => enterpriseCallbacks.decrypt({ token: context.propsValue.token, encodingKey: context.propsValue.encodingKey, receiver: context.auth.props.corpId, signature: query['msg_signature'] ?? '', timestamp: query['timestamp'] ?? '', nonce: query['nonce'] ?? '', encrypted: handshake ? query['echostr'] : enterpriseCallbacks.xmlText({ xml, tag: 'Encrypt' }) }));
    if (error) return { status: 401, body: 'Invalid callback signature' };
    return { status: 200, body: handshake ? plain : 'success', headers: { 'Content-Type': 'text/plain' }, continueToRun: !handshake, triggerPayload: { body: plain, headers: {}, queryParams: {}, method: 'POST' } };
  },
  async run(context) {
    const plain = typeof context.payload.body === 'string' ? context.payload.body : '';
    const read = (tag: string) => enterpriseCallbacks.xmlText({ xml: plain, tag });
    if (read('Event') !== 'change_contact') return [];
    const userid = read('UserID');
    const changeType = read('ChangeType');
    if (!userid) return [{ eventId: `${changeType}:${read('Id')}:${read('CreateTime')}`, changeType, departmentId: read('Id') }];
    const current = await tryCatch(() => wecomContacts.get({ auth: context.auth.props, rateLimit: context.rateLimit, userid }));
    if (current.error && !wecomCommon.missing(current.error)) throw current.error;
    return [{ eventId: `${changeType}:${userid}:${read('CreateTime')}`, changeType, userid, current: current.data }];
  },
});
