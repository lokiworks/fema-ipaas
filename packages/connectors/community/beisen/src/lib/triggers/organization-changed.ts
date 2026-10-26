import { createTrigger, Property, TriggerStrategy } from '@fema-ipaas/connector-sdk';
import { beisenAuth } from '../auth';
import { beisenTimeWindow } from '../common/time-window';

export const organizationChanged = createTrigger({
  auth: beisenAuth, name: 'organization_changed', displayName: 'Organization changed',
  description: 'Wake a department-tree synchronization when the source organization changes',
  type: TriggerStrategy.POLLING, classification: 'READ',
  aiMetadata: { description: 'Read organization changes and emit one wake-up event per poll. Use the event to re-read and converge the whole tree.' },
  reliability: { rateLimits: [{ bucket: 'beisen-api', scope: 'TENANT', perSecond: 50 }] },
  props: { timezone: Property.ShortText({ displayName: 'Timezone', required: false, defaultValue: 'Asia/Shanghai' }) },
  sampleData: { event: 'org-tree', changedCount: 1, checkedAt: '2026-10-27T00:00:00Z' },
  outputSchema: { fields: [{ key: 'event' }, { key: 'changedCount' }, { key: 'checkedAt' }] },
  async onEnable(context) {
    if (!context.isRepublish || await context.store.get<number>(CURSOR) == null) {
      await context.store.put(CURSOR, Date.now());
    }
  },
  async onDisable() {},
  async test(context) {
    const now = Date.now();
    const page = await beisenTimeWindow.fetchPage({ auth: context.auth, rateLimit: context.rateLimit, path: PATH, body: { startTime: beisenTimeWindow.formatTimestamp({ epochMs: now - 15 * 60_000, timeZone: context.propsValue.timezone ?? 'Asia/Shanghai' }), stopTime: beisenTimeWindow.formatTimestamp({ epochMs: now, timeZone: context.propsValue.timezone ?? 'Asia/Shanghai' }), timeWindowQueryType: '2', withDisabled: true, capacity: 1 } });
    return page.records.length > 0 ? [{ event: 'org-tree', changedCount: page.records.length, checkedAt: new Date(now).toISOString() }] : [];
  },
  async run(context) {
    const stopMs = Date.now();
    const previous = await context.store.get<number>(CURSOR);
    const startMs = (previous ?? stopMs) - 15 * 60_000;
    let changedCount = 0;
    for (const window of beisenTimeWindow.segments({ startMs, stopMs })) {
      let scrollId: string | undefined;
      for (let index = 0; index < 100; index++) {
        const page = await beisenTimeWindow.fetchPage({
          auth: context.auth, rateLimit: context.rateLimit, path: PATH,
          body: { startTime: beisenTimeWindow.formatTimestamp({ epochMs: window.startMs, timeZone: context.propsValue.timezone ?? 'Asia/Shanghai' }), stopTime: beisenTimeWindow.formatTimestamp({ epochMs: window.stopMs, timeZone: context.propsValue.timezone ?? 'Asia/Shanghai' }), timeWindowQueryType: '2', withDisabled: true, capacity: 300, ...(scrollId ? { scrollId } : {}) },
        });
        changedCount += page.records.length;
        if (page.records.length === 0 || page.isLastData || !page.scrollId) {
          break;
        }
        if (index === 99) {
          throw new Error('Organization change window contains too many records');
        }
        scrollId = page.scrollId;
      }
    }
    await context.store.put(CURSOR, stopMs);
    return changedCount > 0 ? [{ event: 'org-tree', changedCount, checkedAt: new Date(stopMs).toISOString() }] : [];
  },
});

const PATH = '/TenantBaseExternal/api/v5/Organization/GetByTimeWindow';
const CURSOR = 'organization-change-cursor';
