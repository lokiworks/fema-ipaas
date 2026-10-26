import { fixOwnerMarker, isObject, tryCatch } from '@fema-ipaas/connector-sdk';
import { z } from 'zod';
import { dingtalkCommon, DingtalkRuntime } from './index';
import { dingtalkDepartments } from './departments';

async function get({ userid, ...runtime }: DingtalkRuntime & { userid: string }): Promise<Record<string, unknown>> {
  return normalize(await dingtalkCommon.callApi({ ...runtime, path: '/topapi/v2/user/get', body: { userid } }));
}

async function find({ mobile, ...runtime }: DingtalkRuntime & { mobile: string }): Promise<Record<string, unknown> | null> {
  const result = await tryCatch(() => dingtalkCommon.callApi({ ...runtime, path: '/topapi/v2/user/getbymobile', body: { mobile } }));
  if (result.error) { if (dingtalkCommon.missing(result.error)) return null; throw result.error; }
  if (typeof result.data['userid'] !== 'string') throw new Error('DingTalk mobile lookup returned no user ID');
  return get({ ...runtime, userid: result.data['userid'] });
}

async function provision({ userid, mobile, name, departmentId, jobTitle, email, ...runtime }: ProvisionParams): Promise<Record<string, unknown>> {
  const existing = await tryCatch(() => get({ ...runtime, userid }));
  if (existing.error && !dingtalkCommon.missing(existing.error)) throw existing.error;
  if (existing.data) return { ...existing.data, created: false };
  const matched = await find({ ...runtime, mobile });
  if (matched && matched['userid'] !== userid) throw new Error(fixOwnerMarker.attach({ message: 'This mobile number belongs to another user ID. Resolve the identity conflict before provisioning.', owner: 'SOURCE_DATA_OWNER' }));
  if (matched) return { ...matched, created: false };
  const result = await tryCatch(() => dingtalkCommon.callApi({ ...runtime, path: '/topapi/v2/user/create', write: true, body: { userid, job_number: userid, name, mobile, dept_id_list: [dingtalkDepartments.idNumber(departmentId)], ...(jobTitle ? { title: jobTitle } : {}), ...(email ? { email } : {}) } }));
  if (result.error) {
    const recovered = await tryCatch(() => get({ ...runtime, userid }));
    if (recovered.data) return { ...recovered.data, created: false };
    throw result.error;
  }
  return { userid, employee_no: userid, department_ids: [departmentId], created: true };
}

async function update({ userid, departmentId, jobTitle, managerId, ...runtime }: UpdateParams): Promise<Record<string, unknown>> {
  await dingtalkCommon.callApi({ ...runtime, path: '/topapi/v2/user/update', write: true, body: { userid, ...(departmentId ? { dept_id_list: [dingtalkDepartments.idNumber(departmentId)] } : {}), ...(jobTitle ? { title: jobTitle } : {}), ...(managerId ? { manager_userid: managerId } : {}) } });
  return get({ ...runtime, userid });
}

async function enumerate({ rootDepartmentId = '1', pageSize, pageToken, ...runtime }: DingtalkRuntime & { rootDepartmentId?: string; pageToken?: string; pageSize: number }): Promise<{ items: Record<string, unknown>[]; nextPageToken: string | null }> {
  const cursor = pageToken ? Cursor.parse(JSON.parse(Buffer.from(pageToken, 'base64url').toString())) : { root: rootDepartmentId, departments: (await dingtalkDepartments.list({ ...runtime, rootDepartmentId })).map((row) => String(row['id'])), index: 0, offset: 0 };
  if (cursor.root !== rootDepartmentId || cursor.index >= cursor.departments.length) throw new Error('Invalid DingTalk member cursor');
  const departmentId = cursor.departments[cursor.index];
  const page = await dingtalkCommon.callApi({ ...runtime, path: '/topapi/v2/user/list', body: { dept_id: dingtalkDepartments.idNumber(departmentId), cursor: cursor.offset, size: Math.min(100, Math.max(1, pageSize)) } });
  if (!Array.isArray(page['list']) || !page['list'].every(isObject) || typeof page['has_more'] !== 'boolean') throw new Error('Invalid DingTalk member page');
  const items = page['list'].map(normalize).filter((user) => { const ids = user['department_ids']; return Array.isArray(ids) && [...ids].map(String).filter((id) => cursor.departments.includes(id)).sort((a, b) => Number(a) - Number(b))[0] === departmentId; });
  if (page['has_more'] && (!Number.isSafeInteger(page['next_cursor']) || Number(page['next_cursor']) <= cursor.offset)) throw new Error('DingTalk member pagination did not advance');
  const next = page['has_more'] ? { ...cursor, offset: Number(page['next_cursor']) } : cursor.index + 1 < cursor.departments.length ? { ...cursor, index: cursor.index + 1, offset: 0 } : null;
  return { items, nextPageToken: next ? Buffer.from(JSON.stringify(next)).toString('base64url') : null };
}

function normalize(user: Record<string, unknown>): Record<string, unknown> {
  if (typeof user['userid'] !== 'string' || !Array.isArray(user['dept_id_list']) || user['dept_id_list'].length === 0) throw new Error('DingTalk member response is missing user ID or department memberships');
  return { ...user, employee_no: user['job_number'] || user['userid'], department_ids: user['dept_id_list'].map(String) };
}

const Cursor = z.object({ root: z.string(), departments: z.array(z.string()).min(1).max(5000), index: z.number().int().nonnegative(), offset: z.number().int().nonnegative() });
export const dingtalkContacts = { get, find, provision, update, enumerate };
type ProvisionParams = DingtalkRuntime & { userid: string; mobile: string; name: string; departmentId: string; jobTitle?: string; email?: string };
type UpdateParams = DingtalkRuntime & { userid: string; departmentId?: string; jobTitle?: string; managerId?: string };
