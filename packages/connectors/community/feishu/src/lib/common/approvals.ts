import { HttpMethod } from '@fema-ipaas/connector-common';
import { fixOwnerMarker, isObject, RateLimitContext } from '@fema-ipaas/connector-sdk';
import { z } from 'zod';
import { feishuCommon, FeishuAuthValue } from './index';

async function get({ instanceCode, ...runtime }: Runtime & { instanceCode: string }): Promise<Record<string, unknown>> {
  if (!instanceCode.trim()) throw new Error(fixOwnerMarker.attach({ message: 'Approval instance code is required. Check the trigger output mapping.', owner: 'WORKFLOW_OWNER' }));
  const data = await feishuCommon.callApi<Record<string, unknown>>({ ...runtime, method: HttpMethod.GET, path: `/open-apis/approval/v4/instances/${encodeURIComponent(instanceCode)}`, queryParams: { user_id_type: 'open_id' } });
  if (typeof data['status'] !== 'string' || typeof data['form'] !== 'string') throw new Error('Feishu returned an incomplete approval instance');
  return { ...data, instance_code: instanceCode, form: parseForm(data['form']) };
}

function parseForm(raw: string): Record<string, unknown> {
  const controls: unknown = JSON.parse(raw);
  if (!Array.isArray(controls) || !controls.every(isObject)) throw new Error('Invalid approval form');
  const entries = controls.map((control) => {
    const name = control['name'];
    if (typeof name !== 'string' || !name || name === '__proto__') throw new Error('Approval form controls need unique names');
    return [name, controlValue(control)] satisfies [string, unknown];
  });
  if (new Set(entries.map(([name]) => name)).size !== entries.length) throw new Error(fixOwnerMarker.attach({ message: 'Approval form contains duplicate control names. Give each control a distinct name before mapping fields.', owner: 'SOURCE_DATA_OWNER' }));
  return Object.fromEntries(entries);
}

function controlValue(control: Record<string, unknown>): unknown {
  const value = control['value'];
  switch (control['type']) {
    case 'number': case 'amount': case 'formula': {
      if (value === '' || value === null || value === undefined) return null;
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error('Approval form contains an invalid number');
      return number;
    }
    case 'date': {
      if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Approval form contains an invalid date');
      return new Date(value).toISOString();
    }
    case 'contact': {
      const ids = control['open_ids'];
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) throw new Error('Approval contact control did not include open IDs');
      return ids;
    }
    case 'attachmentV2': case 'attachment': case 'image': {
      if (typeof value === 'string') return value ? value.split(',').map((url) => url.trim()) : [];
      if (!Array.isArray(value)) throw new Error('Approval attachment control must be an array');
      return value.map((item: unknown) => { if (typeof item === 'string') return item; if (isObject(item) && typeof item['url'] === 'string') return item['url']; throw new Error('Approval attachment has no URL'); });
    }
    default: return value;
  }
}

async function enumerate({ approvalCode, lookbackDays = 7, statuses, pageToken, pageSize, ...runtime }: EnumerateParams): Promise<{ items: Record<string, unknown>[]; nextPageToken: string | null }> {
  const now = Date.now();
  const cursor = pageToken ? Cursor.parse(JSON.parse(Buffer.from(pageToken, 'base64url').toString())) : { approvalCode, lookbackDays, start: now - Math.min(90, Math.max(1, lookbackDays)) * 86400000, stop: now, provider: '' };
  if (cursor.approvalCode !== approvalCode || cursor.lookbackDays !== lookbackDays) throw new Error('Approval cursor belongs to a different query');
  const end = Math.min(cursor.start + 36000000 - 1, cursor.stop);
  const page = await feishuCommon.callApi<{ instance_code_list: string[]; has_more?: boolean; page_token?: string }>({ ...runtime, method: HttpMethod.GET, path: '/open-apis/approval/v4/instances', queryParams: { approval_code: approvalCode, start_time: String(cursor.start), end_time: String(end), page_size: String(Math.min(100, Math.max(1, pageSize))), ...(cursor.provider ? { page_token: cursor.provider } : {}) } });
  if (!Array.isArray(page.instance_code_list) || !page.instance_code_list.every((code) => typeof code === 'string')) throw new Error('Invalid approval instance page');
  if (page.has_more && (!page.page_token || page.page_token === cursor.provider)) throw new Error('Approval pagination did not advance');
  const items: Record<string, unknown>[] = [];
  for (const instanceCode of page.instance_code_list) {
    const instance = await get({ ...runtime, instanceCode });
    if (!statuses?.length || statuses.includes(String(instance['status']))) items.push(instance);
  }
  const next = page.has_more ? { ...cursor, provider: page.page_token } : end < cursor.stop ? { ...cursor, start: end + 1, provider: '' } : null;
  return { items, nextPageToken: next ? Buffer.from(JSON.stringify(next)).toString('base64url') : null };
}

async function subscribe({ approvalCode, ...runtime }: Runtime & { approvalCode: string }): Promise<void> {
  await feishuCommon.callApi({ ...runtime, method: HttpMethod.POST, path: `/open-apis/approval/v4/approvals/${encodeURIComponent(approvalCode)}/subscribe` });
}

const Cursor = z.object({ approvalCode: z.string(), lookbackDays: z.number(), start: z.number().int().nonnegative(), stop: z.number().int().nonnegative(), provider: z.string() }).refine((cursor) => cursor.stop >= cursor.start && cursor.stop - cursor.start <= 90 * 86400000, { message: 'connectors.approval.invalidCursor' });

export const feishuApprovals = { get, enumerate, parseForm, subscribe };
export type ApprovalRuntime = Runtime;
type Runtime = { auth: FeishuAuthValue; rateLimit?: RateLimitContext };
type EnumerateParams = Runtime & { approvalCode: string; lookbackDays?: number; statuses?: string[]; pageToken?: string; pageSize: number };
