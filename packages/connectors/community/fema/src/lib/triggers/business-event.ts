import { HttpMethod } from '@fema-ipaas/connector-common';
import {
  Property,
  TriggerStrategy,
  WebhookHandshakeStrategy,
  createTrigger,
  isObject,
  tryCatch,
} from '@fema-ipaas/connector-sdk';
import type { Store } from '@fema-ipaas/connector-sdk';

import { femaAuth } from '../auth';
import { FEMA_PENDING_CODE_KEY, FEMA_SECRET_STORE_KEY, FEMA_SIGNATURE_HEADER, FemaConnection, FemaSubscription, femaCommon } from '../common';
import { femaOutputSchemas } from '../output-schemas';

export const businessEvent = createTrigger({
  auth: femaAuth,
  name: 'business_event',
  displayName: 'FEMA Business Event',
  description: 'Starts the workflow when FEMA pushes a business event, such as a contract taking effect or a bill being issued',
  classification: 'READ',
  aiMetadata: {
    description:
      'Start a workflow the moment something happens in FEMA, for example rental-agreement.contract.activate. Turning the workflow on registers this workflow with FEMA under the connection application; turning it off removes the registration. One run is one event; the payload only says which object changed, so add Read Object to load its details. FEMA only pushes events about objects the application is allowed to read.',
  },
  type: TriggerStrategy.WEBHOOK,
  handshakeConfiguration: {
    strategy: WebhookHandshakeStrategy.BODY_PARAM_PRESENT,
    paramName: 'challenge',
  },
  props: {
    setup: Property.MarkDown({
      value:
        '打开工作流时，会用连接里的 FEMA 应用身份到 FEMA 登记下面这些事件类型，推送地址就是本工作流；关闭工作流时撤销这条登记。\n\nFEMA 用登记时发下来的密钥给每条推送签名，签名对不上的推送一律丢弃；同一事件重复送达只触发一次。\n\n连接里的应用必须能读这些事件所说的对象（例如能读合同才能收合同生效），否则 FEMA 会拒绝登记，工作流也就打不开。',
    }),
    events: Property.Array({
      displayName: 'Event Types',
      description:
        'One event type per entry, written as app.object.ability, for example rental-agreement.contract.activate or billing.bill.issue.',
      required: true,
    }),
  },
  outputSchema: femaOutputSchemas.businessEvent,
  sampleData: {
    id: '732045112233',
    type: 'rental-agreement.contract.activate',
    tenantId: 't_8f2c',
    occurredAt: '2026-11-04T03:21:07Z',
    app: 'rental-agreement',
    ability: 'activate',
    object: { code: 'contract', id: '981233' },
    objectPath: 'rental-agreement/contract',
  },
  async onHandshake(context) {
    const body = context.payload.body;
    const challenge = isObject(body) ? body['challenge'] : undefined;
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { challenge: typeof challenge === 'string' || typeof challenge === 'number' ? challenge : '' },
    };
  },
  async onEnable(context) {
    const events = femaCommon.normalizeEvents({ events: context.propsValue.events });
    if (events.length === 0) {
      throw new Error('请至少填写一个事件类型，例如 rental-agreement.contract.activate');
    }
    const previous = await context.store.get<FemaSubscription>(FEMA_SECRET_STORE_KEY);
    if (previous?.id) {
      await removeById({ auth: context.auth, id: previous.id });
      await context.store.delete(FEMA_SECRET_STORE_KEY);
    }
    const registration = await register({ auth: context.auth, store: context.store, webhookUrl: context.webhookUrl, events });
    const secret = secretOf({ created: registration.created });
    if (!secret) {
      const orphan = idOf({ created: registration.created });
      if (orphan) {
        await removeById({ auth: context.auth, id: orphan });
      }
      throw new Error('FEMA 接受了登记，但没有返回签名密钥（plainSecret），无法校验之后的推送');
    }
    const withheldEvents = withheldOf({ created: registration.created });
    await context.store.put<FemaSubscription>(FEMA_SECRET_STORE_KEY, {
      id: idOf({ created: registration.created }),
      code: registration.code,
      secret,
      events,
      withheldEvents,
    });
    await context.store.delete(FEMA_PENDING_CODE_KEY);
    if (withheldEvents.length > 0) {
      console.warn(`FEMA 已登记，但这些事件暂时不会推送：${withheldEvents.join('、')}。连接里的应用对相应对象只有部分数据的读权限，请在 FEMA 给它完整的读权限。`);
    }
  },
  async onDisable(context) {
    const subscription = await context.store.get<FemaSubscription>(FEMA_SECRET_STORE_KEY);
    const pendingCode = await context.store.get<string>(FEMA_PENDING_CODE_KEY);
    if (subscription?.id) {
      await removeById({ auth: context.auth, id: subscription.id });
    }
    else if (subscription?.code) {
      await discardByCode({ auth: context.auth, code: subscription.code });
    }
    if (pendingCode && pendingCode !== subscription?.code) {
      await discardByCode({ auth: context.auth, code: pendingCode });
    }
    await context.store.delete(FEMA_SECRET_STORE_KEY);
    await context.store.delete(FEMA_PENDING_CODE_KEY);
  },
  async run(context) {
    const subscription = await context.store.get<FemaSubscription>(FEMA_SECRET_STORE_KEY);
    if (!subscription) {
      return [];
    }
    const verified = femaCommon.verifySignature({
      secret: subscription.secret,
      signature: femaCommon.headerOf({ headers: context.payload.headers, name: FEMA_SIGNATURE_HEADER }),
      rawBody: context.payload.rawBody,
      body: context.payload.body,
    });
    if (!verified) {
      return [];
    }
    const event = femaCommon.parseEvent({ body: context.payload.body });
    if (!event || !femaCommon.matchesEvents({ type: event.type, events: subscription.events })) {
      return [];
    }
    const tenant = context.auth.props?.['tenant'];
    if (event.tenantId && typeof tenant === 'string' && tenant.length > 0 && event.tenantId !== tenant) {
      return [];
    }
    const fresh = await femaCommon.rememberEvent({ store: context.store, id: event.id, now: Date.now() });
    return fresh ? [femaCommon.flatten({ event })] : [];
  },
});

async function register({ auth, store, webhookUrl, events }: RegisterParams): Promise<Registration> {
  const firstCode = femaCommon.subscriptionCode({ webhookUrl });
  await store.put<string>(FEMA_PENDING_CODE_KEY, firstCode);
  const first = await tryCatch(() => createSubscription({ auth, code: firstCode, webhookUrl, events }));
  if (!first.error) {
    return { code: firstCode, created: first.data };
  }
  if (!isUncertain({ error: first.error })) {
    throw first.error;
  }
  await discardByCode({ auth, code: firstCode });
  const retryCode = femaCommon.subscriptionCode({ webhookUrl });
  await store.put<string>(FEMA_PENDING_CODE_KEY, retryCode);
  const created = await createSubscription({ auth, code: retryCode, webhookUrl, events });
  return { code: retryCode, created };
}

async function createSubscription({ auth, code, webhookUrl, events }: CreateSubscriptionParams): Promise<unknown> {
  return femaCommon.call({
    auth,
    method: HttpMethod.POST,
    path: 'webhook/subscription/create',
    body: { code, endpoint: webhookUrl, events: { value: events } },
  });
}

async function discardByCode({ auth, code }: { auth: FemaConnection; code: string }): Promise<void> {
  const { data, error } = await tryCatch(() =>
    femaCommon.call({
      auth,
      method: HttpMethod.POST,
      path: 'webhook/subscription/find-one',
      body: { filter: { code } },
    }),
  );
  if (error && isGone({ error })) {
    return;
  }
  if (error) {
    throw error;
  }
  const id = idOf({ created: data });
  if (id) {
    await removeById({ auth, id });
  }
}

async function removeById({ auth, id }: { auth: FemaConnection; id: string }): Promise<void> {
  const { error } = await tryCatch(() =>
    femaCommon.call({
      auth,
      method: HttpMethod.POST,
      path: 'webhook/subscription/delete',
      body: { id },
    }),
  );
  if (error && !isGone({ error })) {
    throw error;
  }
}

function isUncertain({ error }: { error: unknown }): boolean {
  if (!(error instanceof femaCommon.FemaApiError)) {
    return true;
  }
  return error.code === 'ALREADY_EXISTS' || error.status >= 500 || error.status === 408 || error.status === 429;
}

function secretOf({ created }: { created: unknown }): string | null {
  if (!isObject(created)) {
    return null;
  }
  const secret = created['plainSecret'];
  return typeof secret === 'string' && secret.length > 0 ? secret : null;
}

function withheldOf({ created }: { created: unknown }): string[] {
  if (!isObject(created) || !Array.isArray(created['withheldEvents'])) {
    return [];
  }
  return created['withheldEvents'].map((event: unknown) => String(event));
}

function idOf({ created }: { created: unknown }): string | null {
  if (!isObject(created)) {
    return null;
  }
  const id = created['id'];
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

function isGone({ error }: { error: unknown }): boolean {
  return error instanceof femaCommon.FemaApiError && (error.status === 404 || error.code === 'NOT_FOUND');
}

type RegisterParams = {
  auth: FemaConnection;
  store: Store;
  webhookUrl: string;
  events: string[];
};

type CreateSubscriptionParams = {
  auth: FemaConnection;
  code: string;
  webhookUrl: string;
  events: string[];
};

type Registration = {
  code: string;
  created: unknown;
};
