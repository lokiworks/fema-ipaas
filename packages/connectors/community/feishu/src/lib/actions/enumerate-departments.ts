import { createAction, Property } from '@fema-ipaas/connector-sdk';
import { feishuAuth } from '../auth';
import { feishuDepartments } from '../common/departments';

export const enumerateDepartments = createAction({
  auth: feishuAuth, name: 'enumerate_departments', displayName: 'Enumerate departments', description: 'Read a page of the entire department tree',
  audience: 'both', classification: 'SEARCH', aiMetadata: { description: 'Read every department below a root, one page at a time. Continue with nextPageToken until null.', idempotent: true },
  reliability: { enumeration: { entity: 'DEPARTMENT', businessKeyPath: 'open_department_id' }, rateLimits: [{ bucket: 'contact-read', scope: 'APP_ENDPOINT', perSecond: 50 }] },
  outputSchema: { fields: [{ key: 'items', listItems: [{ key: 'open_department_id' }, { key: 'department_id' }, { key: 'name' }, { key: 'parent_department_id' }] }, { key: 'nextPageToken' }] },
  props: { allPages: Property.Checkbox({ displayName: 'Read the entire tree', required: false, defaultValue: false }), rootDepartmentId: Property.ShortText({ displayName: 'Root department ID', required: true, defaultValue: '0' }), pageToken: Property.ShortText({ displayName: 'Page token', required: false }), pageSize: Property.Number({ displayName: 'Page size', required: true, defaultValue: 50 }) },
  async run(context) {
    if (!context.propsValue.allPages) return feishuDepartments.enumerate({ ...context.propsValue, auth: context.auth, rateLimit: context.rateLimit });
    const items: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;
    do {
      const page = await feishuDepartments.enumerate({ ...context.propsValue, auth: context.auth, rateLimit: context.rateLimit, pageToken });
      items.push(...page.items);
      if (items.length > 5000) throw new Error('Department tree exceeds the 5000-department synchronization limit');
      pageToken = page.nextPageToken ?? undefined;
      if (pageToken && seen.has(pageToken)) throw new Error('Feishu repeated a department page');
      if (pageToken) seen.add(pageToken);
    } while (pageToken);
    return { items, nextPageToken: null };
  },
});
