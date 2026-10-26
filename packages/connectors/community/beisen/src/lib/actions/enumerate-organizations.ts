import { HttpMethod } from '@fema-ipaas/connector-common';
import { createAction, fixOwnerMarker, Property, type SourceOrgNode } from '@fema-ipaas/connector-sdk';
import { beisenAuth } from '../auth';
import { beisenCommon } from '../common';

export const enumerateOrganizations = createAction({
  auth: beisenAuth, name: 'enumerate_organizations', displayName: 'Enumerate organizations',
  description: 'Read the current organization tree, including disabled units', audience: 'both', classification: 'SEARCH',
  aiMetadata: { description: 'Enumerate the administrative organization tree from a root OId. Pages use local offsets over the returned tree.', idempotent: true },
  reliability: { enumeration: { entity: 'DEPARTMENT', businessKeyPath: 'key' }, rateLimits: [{ bucket: 'beisen-api', scope: 'TENANT', perSecond: 50 }] },
  props: {
    rootOrganizationId: Property.ShortText({ displayName: 'Root organization OId', required: true }),
    allPages: Property.Checkbox({ displayName: 'Read the entire tree', required: false, defaultValue: false }),
    pageToken: Property.ShortText({ displayName: 'Page token', required: false }),
    pageSize: Property.Number({ displayName: 'Page size', required: true, defaultValue: 300 }),
  },
  outputSchema: { fields: [{ key: 'items', listItems: [{ key: 'key' }, { key: 'parentKey' }, { key: 'name' }, { key: 'order' }, { key: 'disabled' }] }, { key: 'nextPageToken' }] },
  async run(context) {
    const root = Number(context.propsValue.rootOrganizationId);
    const offset = Number(context.propsValue.pageToken ?? 0);
    const size = context.propsValue.pageSize;
    if (!Number.isSafeInteger(root) || root < 0 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(size) || size < 1 || size > 1000) {
      throw new Error(fixOwnerMarker.attach({ message: 'Invalid organization root or pagination', owner: 'WORKFLOW_OWNER' }));
    }
    const records = await beisenCommon.callBusinessApi<Record<string, unknown>[]>({
      auth: context.auth, rateLimit: context.rateLimit, method: HttpMethod.POST,
      path: '/TenantBaseExternal/api/v5/Organization/GetSubOrganizationTrees',
      body: { oIds: [root], isWithDisable: true, isWithSelf: true, isWithDeleted: false },
    });
    const items = (records ?? []).map(normalize);
    if (context.propsValue.allPages) {
      if (items.length > 5000) throw new Error('Organization tree exceeds the 5000-department synchronization limit');
      return { items, nextPageToken: null };
    }
    const next = offset + size;
    return { items: items.slice(offset, next), nextPageToken: next < items.length ? String(next) : null };
  },
});

function normalize(record: Record<string, unknown>): SourceOrgNode {
  const key = record['oId'];
  const parent = record['pOIdOrgAdmin'];
  const name = record['name'];
  const order = record['orderAdmin'];
  const status = record['status'];
  if (typeof key !== 'number' || typeof name !== 'string' || status !== 0 && status !== 1) {
    throw new Error(fixOwnerMarker.attach({ message: 'Beisen organization fields do not match oId, name and status', owner: 'SOURCE_DATA_OWNER' }));
  }
  return { key: String(key), parentKey: typeof parent === 'number' ? String(parent) : null, name, order: typeof order === 'number' ? order : null, disabled: status === 0 };
}
