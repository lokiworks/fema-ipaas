import { createTrigger, isObject, Property, TriggerStrategy, tryCatch, WebhookHandshakeStrategy } from '@fema-ipaas/connector-sdk';
import { feishuAuth } from '../auth';
import { APPROVAL_LIMITS, APPROVAL_SCAN_PROPS, APPROVAL_SCHEMA } from '../actions/approvals';
import { feishuApprovals } from '../common/approvals';
import { eventPayload } from '../event-payload';

function webhook() {
  return createTrigger({ auth: feishuAuth, name: 'approval_instance_changed', displayName: 'Approval instance changed', description: 'Verify approval events and re-read the current instance. The approval subscription is shared by the app; disabling a workflow leaves it subscribed.', classification: 'READ', type: TriggerStrategy.WEBHOOK, reliability: { rateLimits: APPROVAL_LIMITS }, handshakeConfiguration: { strategy: WebhookHandshakeStrategy.ALWAYS }, props: { approvalCode: APPROVAL_SCAN_PROPS.approvalCode, statuses: APPROVAL_SCAN_PROPS.statuses, verificationToken: Property.ShortText({ displayName: 'Verification Token', required: true }), encryptKey: Property.ShortText({ displayName: 'Encrypt Key', required: false }), setup: Property.MarkDown({ value: 'Enable approval:approval permission, publish the app, then configure Events & Callbacks → approval_instance with this URL:\n\n{{webhookUrl}}\n\nUse one callback workflow per app. Disabling this workflow preserves the app-wide subscription; remove it in the app console when no workflow needs it.' }) }, outputSchema: APPROVAL_SCHEMA, sampleData: SAMPLE,
    async onEnable(context) { await feishuApprovals.subscribe({ auth: context.auth, rateLimit: context.rateLimit, approvalCode: context.propsValue.approvalCode }); }, async onDisable() {},
    async onHandshake(context) {
      const decoded = await tryCatch(async () => eventPayload.decode({ payload: context.payload.body, encryptKey: context.propsValue.encryptKey }));
      if (decoded.error || eventPayload.token(decoded.data) !== context.propsValue.verificationToken) return { status: 401, body: { error: 'Invalid verification token' } };
      const challenge = eventPayload.challenge(decoded.data);
      return { status: 200, body: challenge ? { challenge } : {}, continueToRun: !challenge, triggerPayload: { body: decoded.data, headers: {}, queryParams: {}, method: 'POST' } };
    },
    async run(context) {
      const body = context.payload.body;
      if (!isObject(body) || eventPayload.eventType(body) !== 'approval_instance') return [];
      const event = body['event'];
      if (!isObject(event) || event['approval_code'] !== context.propsValue.approvalCode || typeof event['instance_code'] !== 'string') return [];
      const current = await feishuApprovals.get({ auth: context.auth, rateLimit: context.rateLimit, instanceCode: event['instance_code'] });
      return context.propsValue.statuses?.length && !context.propsValue.statuses.includes(String(current['status'])) ? [] : [current];
    },
  });
}

function polling() {
  return createTrigger({ auth: feishuAuth, name: 'approval_instance_polled', displayName: 'Approval instance polled', description: 'Scan recent approvals without a public callback URL, emitting each instance and status once', classification: 'READ', type: TriggerStrategy.POLLING, reliability: { rateLimits: APPROVAL_LIMITS }, props: APPROVAL_SCAN_PROPS, outputSchema: APPROVAL_SCHEMA, sampleData: SAMPLE,
    async onEnable(context) { if (!context.isRepublish) await context.store.put('approval-seen', {}); }, async onDisable() {},
    async test(context) { return (await feishuApprovals.enumerate({ ...context.propsValue, auth: context.auth, rateLimit: context.rateLimit, pageSize: 1 })).items; },
    async run(context) {
      const previous = await context.store.get<Record<string, string>>('approval-seen') ?? {};
      const current: Record<string, string> = {};
      const changed: Record<string, unknown>[] = [];
      let pageToken: string | undefined;
      for (let index = 0; index < 1000; index++) {
        const page = await feishuApprovals.enumerate({ ...context.propsValue, auth: context.auth, rateLimit: context.rateLimit, statuses: [], pageSize: 100, pageToken });
        for (const item of page.items) {
          const key = String(item['instance_code']);
          const status = String(item['status']);
          current[key] = status;
          if (previous[key] !== status && (!context.propsValue.statuses?.length || context.propsValue.statuses.includes(status))) changed.push(item);
          if (Object.keys(current).length > 10000 || changed.length > 5000) throw new Error('Approval polling exceeded its bounded scan; narrow the lookback or definition');
        }
        if (!page.nextPageToken) { await context.store.put('approval-seen', current); return changed; }
        pageToken = page.nextPageToken;
      }
      throw new Error('Approval scan exceeded 1000 pages');
    },
  });
}

const SAMPLE = { instance_code: 'instance-1', serial_number: '202610270001', status: 'APPROVED', open_id: 'ou_applicant', form: { Amount: 100, Category: 'Travel' } };
export const approvalTriggers = [webhook(), polling()];
