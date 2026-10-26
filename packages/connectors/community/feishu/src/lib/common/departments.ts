import { HttpMethod } from '@fema-ipaas/connector-common';
import { fixOwnerMarker, tryCatch, type EnumerationPage, type RateLimitContext } from '@fema-ipaas/connector-sdk';
import { feishuCommon, type FeishuAuthValue } from './index';
import { feishuIdempotency } from './idempotency';

async function get({ auth, rateLimit, departmentId }: DepartmentRef): Promise<Department> {
  const result = await feishuCommon.callApi<{ department: Department }>({
    auth, rateLimit, method: HttpMethod.GET,
    path: `/open-apis/contact/v3/departments/${encodeURIComponent(departmentId)}`,
    queryParams: { department_id_type: idType(departmentId), user_id_type: 'open_id' },
  });
  return result.department;
}

async function upsert({ auth, rateLimit, input }: UpsertParams): Promise<UpsertResult> {
  const existing = await find({ auth, rateLimit, departmentId: input.targetDepartmentId || input.customDepartmentId });
  const parent = input.parentDepartmentId === '0' ? { department_id: '0', open_department_id: '0' } : await get({ auth, rateLimit, departmentId: input.parentDepartmentId });
  if (existing && [existing.department_id, existing.open_department_id].includes(input.parentDepartmentId)) {
    throw new Error(fixOwnerMarker.attach({ message: 'A department cannot be its own parent', owner: 'MAPPING_OWNER' }));
  }
  const desired = {
    name: input.name,
    parent_department_id: idType(input.targetDepartmentId || input.customDepartmentId) === 'open_department_id' ? parent.open_department_id : parent.department_id,
    ...(input.leaderOpenId ? { leader_user_id: input.leaderOpenId } : {}),
    ...(input.order !== undefined ? { order: String(input.order) } : {}),
  };
  if (existing) {
    const changes = Object.fromEntries(Object.entries(desired).filter(([key, value]) => existing[key] !== value));
    const changed = Object.keys(changes);
    if (changed.length > 0) {
      await feishuCommon.callApi({
        auth, rateLimit, method: HttpMethod.PATCH,
        path: `/open-apis/contact/v3/departments/${encodeURIComponent(existing.open_department_id)}`,
        queryParams: { department_id_type: 'open_department_id', user_id_type: 'open_id' }, body: { ...changes, ...(changes['parent_department_id'] ? { parent_department_id: parent.open_department_id } : {}) },
      });
    }
    return { created: false, open_department_id: existing.open_department_id, department_id: existing.department_id, changed };
  }
  const { data, error } = await tryCatch(() => feishuCommon.callApi<{ department: Department }>({
    auth, rateLimit, method: HttpMethod.POST, path: '/open-apis/contact/v3/departments',
    queryParams: { department_id_type: 'department_id', user_id_type: 'open_id', client_token: feishuIdempotency.uuidFrom({ seed: `${auth.props.appId}:dept:${input.customDepartmentId}` }) },
    body: { ...desired, department_id: input.customDepartmentId },
  }));
  if (error) {
    if (![43000, 43007].includes(feishuCommon.errorCodeOf(error) ?? -1)) {
      throw error;
    }
    const raced = await get({ auth, rateLimit, departmentId: input.customDepartmentId });
    return { created: false, open_department_id: raced.open_department_id, department_id: raced.department_id, changed: [] };
  }
  return { created: true, open_department_id: data.department.open_department_id, department_id: data.department.department_id, changed: Object.keys(desired) };
}

async function archive({ auth, rateLimit, departmentId, archiveParentId }: DepartmentRef & { archiveParentId: string }): Promise<Department> {
  const current = await get({ auth, rateLimit, departmentId });
  const parent = archiveParentId === '0' ? { open_department_id: '0' } : await get({ auth, rateLimit, departmentId: archiveParentId });
  await feishuCommon.callApi({
    auth, rateLimit, method: HttpMethod.PATCH,
    path: `/open-apis/contact/v3/departments/${encodeURIComponent(current.open_department_id)}`,
    queryParams: { department_id_type: 'open_department_id' }, body: { parent_department_id: parent.open_department_id },
  });
  return get({ auth, rateLimit, departmentId: current.open_department_id });
}

async function enumerate({ auth, rateLimit, rootDepartmentId, pageToken, pageSize }: EnumerateParams): Promise<EnumerationPage> {
  const root = rootDepartmentId === '0' || rootDepartmentId.startsWith('od-') ? rootDepartmentId : (await get({ auth, rateLimit, departmentId: rootDepartmentId })).open_department_id;
  const page = await feishuCommon.callApi<{ items?: Department[], has_more?: boolean, page_token?: string }>({
    auth, rateLimit, method: HttpMethod.GET,
    path: `/open-apis/contact/v3/departments/${encodeURIComponent(root)}/children`,
    queryParams: { department_id_type: 'open_department_id', fetch_child: 'true', page_size: String(Math.min(50, Math.max(1, pageSize))), ...(pageToken ? { page_token: pageToken } : {}) },
  });
  if (page.has_more && !page.page_token) {
    throw new Error('Feishu returned more departments without a page token');
  }
  return { items: page.items ?? [], nextPageToken: page.has_more ? page.page_token ?? null : null };
}

async function find(params: DepartmentRef): Promise<Department | null> {
  const { data, error } = await tryCatch(() => get(params));
  if (error && feishuCommon.errorCodeOf(error) !== 40015) {
    throw error;
  }
  return data;
}

function idType(id: string): string {
  return id.startsWith('od-') ? 'open_department_id' : 'department_id';
}

export const feishuDepartments = { get, upsert, archive, enumerate };

export type Department = { department_id: string; open_department_id: string; name: string; parent_department_id: string; leader_user_id?: string; order?: string; [key: string]: unknown };
export type UpsertDepartmentInput = { customDepartmentId: string; targetDepartmentId?: string; name: string; parentDepartmentId: string; leaderOpenId?: string; order?: number };
type DepartmentRef = { auth: FeishuAuthValue; rateLimit?: RateLimitContext; departmentId: string };
type UpsertParams = { auth: FeishuAuthValue; rateLimit?: RateLimitContext; input: UpsertDepartmentInput };
type UpsertResult = { created: boolean; open_department_id: string; department_id: string; changed: string[] };
type EnumerateParams = { auth: FeishuAuthValue; rateLimit?: RateLimitContext; rootDepartmentId: string; pageToken?: string; pageSize: number };
