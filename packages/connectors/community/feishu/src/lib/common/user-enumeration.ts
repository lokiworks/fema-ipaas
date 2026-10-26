import { HttpMethod } from '@fema-ipaas/connector-common';
import { fixOwnerMarker, tryCatchSync, type RateLimitContext } from '@fema-ipaas/connector-sdk';
import { z } from 'zod';
import { feishuCommon, type FeishuAuthValue } from './index';
import { feishuContacts } from './contacts';
import { feishuDepartments } from './departments';

async function page({ auth, rateLimit, rootDepartmentId, pageToken, pageSize }: PageParams): Promise<{ items: Record<string, unknown>[]; nextPageToken: string | null }> {
  const cursor = pageToken ? decode({ value: pageToken, rootDepartmentId, appId: auth.props.appId }) : await firstCursor({ auth, rateLimit, rootDepartmentId });
  const departmentId = cursor.departments[cursor.index];
  if (!departmentId) return { items: [], nextPageToken: null };
  const response = await feishuCommon.callApi<{ items?: Record<string, unknown>[]; has_more?: boolean; page_token?: string }>({
    auth, rateLimit, method: HttpMethod.GET, path: '/open-apis/contact/v3/users/find_by_department',
    queryParams: { user_id_type: 'open_id', department_id_type: 'open_department_id', department_id: departmentId, page_size: String(Math.min(50, Math.max(1, pageSize))), ...(cursor.providerToken ? { page_token: cursor.providerToken } : {}) },
  });
  if (response.has_more && !response.page_token) throw new Error('Feishu returned more users without a page token');
  const inside = new Set(cursor.departments);
  const items = (response.items ?? []).filter((user) => {
    const departments = user['department_ids'];
    if (!Array.isArray(departments) || departments.some((id: unknown) => typeof id !== 'string')) {
      throw new Error(fixOwnerMarker.attach({ message: 'Feishu did not return department membership; check contact permissions', owner: 'TARGET_ADMIN' }));
    }
    const canonical = departments.filter((id: unknown): id is string => typeof id === 'string' && inside.has(id)).sort()[0];
    if (!canonical) throw new Error('Feishu returned a user without a department inside the enumerated tree');
    return canonical === departmentId;
  }).map(normalize);
  const next = response.has_more ? { ...cursor, providerToken: response.page_token } : { ...cursor, index: cursor.index + 1, providerToken: undefined };
  return { items, nextPageToken: next.index < next.departments.length ? Buffer.from(JSON.stringify(next)).toString('base64url') : null };
}

async function firstCursor({ auth, rateLimit, rootDepartmentId }: Omit<PageParams, 'pageToken' | 'pageSize'>): Promise<Cursor> {
  const root = rootDepartmentId === '0' || rootDepartmentId.startsWith('od-') ? rootDepartmentId : (await feishuDepartments.get({ auth, rateLimit, departmentId: rootDepartmentId })).open_department_id;
  const departments = await feishuContacts.listDepartments({ auth, rateLimit, input: { parentDepartmentId: root, includeAllLevels: true, maxItems: 20001 } });
  if (departments.length > 20000) throw new Error('Department tree exceeds 20000 departments');
  return { departments: [root, ...departments.filter((item) => !item.is_deleted).map((item) => item.open_department_id)], index: 0, rootDepartmentId, appId: auth.props.appId };
}

function decode({ value, rootDepartmentId, appId }: { value: string; rootDepartmentId: string; appId: string }): Cursor {
  const result = tryCatchSync(() => Cursor.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))));
  if (result.error || result.data.rootDepartmentId !== rootDepartmentId || result.data.appId !== appId || result.data.index < 0 || result.data.index >= result.data.departments.length) {
    throw new Error('Invalid user enumeration cursor');
  }
  return result.data;
}

function normalize(user: Record<string, unknown>): Record<string, unknown> {
  const status = user['status'];
  return { open_id: user['open_id'], employee_no: user['employee_no'] ?? null, name: user['name'] ?? null, email: user['email'] ?? null, mobile: user['mobile'] ?? null, job_title: user['job_title'] ?? null, department_ids: user['department_ids'], is_frozen: typeof status === 'object' && status !== null && 'is_frozen' in status && status.is_frozen === true, is_resigned: typeof status === 'object' && status !== null && 'is_resigned' in status && status.is_resigned === true };
}

export const feishuUserEnumeration = { page };

const Cursor = z.object({ departments: z.array(z.string()), index: z.number().int(), providerToken: z.string().optional(), rootDepartmentId: z.string(), appId: z.string() });
type Cursor = z.infer<typeof Cursor>;
type PageParams = { auth: FeishuAuthValue; rateLimit?: RateLimitContext; rootDepartmentId: string; pageToken?: string; pageSize: number };
