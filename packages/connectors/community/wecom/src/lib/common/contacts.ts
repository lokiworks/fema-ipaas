import { HttpMethod } from '@fema-ipaas/connector-common';
import { fixOwnerMarker, isObject, tryCatch } from '@fema-ipaas/connector-sdk';
import { wecomCommon, WecomRuntime } from './index';

async function get({ userid, ...runtime }: WecomRuntime & { userid: string }): Promise<Record<string, unknown>> {
  const user = await wecomCommon.callApi({ ...runtime, path: '/cgi-bin/user/get', query: { userid } });
  if (!Array.isArray(user['department']) || typeof user['userid'] !== 'string') throw new Error('WeCom member response is missing userid or departments');
  return { ...user, employee_no: user['userid'], department_ids: user['department'].map(String), is_frozen: user['status'] === 2 };
}

async function find({ mobile, email, ...runtime }: WecomRuntime & { mobile?: string; email?: string }): Promise<Record<string, unknown> | null> {
  if (!mobile && !email) throw new Error('Provide a mobile number or an email address');
  const { data, error } = await tryCatch(() => wecomCommon.callApi({ ...runtime, purpose: 'contact', method: HttpMethod.POST, path: mobile ? '/cgi-bin/user/getuserid' : '/cgi-bin/user/get_userid_by_email', body: mobile ? { mobile } : { email, email_type: 1 } }));
  if (error) { if (wecomCommon.missing(error)) return null; throw error; }
  if (typeof data['userid'] !== 'string') throw new Error('WeCom returned no user ID');
  return get({ ...runtime, userid: data['userid'] });
}

async function provision({ userid, mobile, email, name, departmentId, jobTitle, ...runtime }: ProvisionParams): Promise<Record<string, unknown>> {
  const { data: existing, error } = await tryCatch(() => get({ ...runtime, userid }));
  if (error && !wecomCommon.missing(error)) throw error;
  if (existing) return { ...existing, created: false };
  const matched = mobile || email ? await find({ ...runtime, mobile, email }) : null;
  if (matched) {
    if (matched['userid'] !== userid) throw new Error(fixOwnerMarker.attach({ message: 'The mobile number or email is bound to another user ID. Resolve the identity conflict before provisioning.', owner: 'SOURCE_DATA_OWNER' }));
    return { ...matched, created: false };
  }
  const { error: writeError } = await tryCatch(() => wecomCommon.callApi({ ...runtime, purpose: 'contact', method: HttpMethod.POST, path: '/cgi-bin/user/create', write: true, body: { userid, name, department: [departmentNumber(departmentId)], ...(mobile ? { mobile } : {}), ...(email ? { email } : {}), ...(jobTitle ? { position: jobTitle } : {}) } }));
  if (writeError) {
    const { data: raced } = await tryCatch(() => get({ ...runtime, userid }));
    if (raced) return { ...raced, created: false };
    throw writeError;
  }
  return { userid, employee_no: userid, department_ids: [departmentId], created: true };
}

async function update({ userid, departmentId, jobTitle, managerId, enable, ...runtime }: UpdateParams): Promise<Record<string, unknown>> {
  await wecomCommon.callApi({ ...runtime, purpose: 'contact', method: HttpMethod.POST, path: '/cgi-bin/user/update', write: true, body: { userid, ...(departmentId ? { department: [departmentNumber(departmentId)] } : {}), ...(jobTitle ? { position: jobTitle } : {}), ...(managerId ? { direct_leader: [managerId] } : {}), ...(enable !== undefined ? { enable } : {}) } });
  return get({ ...runtime, userid });
}

async function enumerate({ pageToken, pageSize, ...runtime }: WecomRuntime & { pageToken?: string; pageSize: number }): Promise<{ items: Record<string, unknown>[]; nextPageToken: string | null }> {
  const result = await wecomCommon.callApi({ ...runtime, purpose: 'contact', method: HttpMethod.POST, path: '/cgi-bin/user/list_id', body: { ...(pageToken ? { cursor: pageToken } : {}), limit: Math.min(300, Math.max(1, pageSize)) } });
  const pairs = result['dept_user'];
  if (!Array.isArray(pairs)) throw new Error('WeCom returned no member list');
  const items: Record<string, unknown>[] = [];
  for (const pair of pairs) {
    if (!isObject(pair) || typeof pair['userid'] !== 'string' || typeof pair['department'] !== 'number') throw new Error('Invalid WeCom member enumeration');
    const user = await get({ ...runtime, userid: pair['userid'] });
    const departments = user['department_ids'];
    if (!Array.isArray(departments) || departments.length === 0) throw new Error('WeCom did not return the membership needed to deduplicate enumeration');
    const canonical = [...departments].map(String).sort((first, second) => Number(first) - Number(second))[0];
    if (canonical === String(pair['department'])) items.push(user);
  }
  const next = result['next_cursor'];
  if (next !== undefined && typeof next !== 'string') throw new Error('Invalid WeCom member cursor');
  return { items, nextPageToken: next || null };
}

function departmentNumber(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(fixOwnerMarker.attach({ message: 'WeCom department IDs must be positive integers. Check the department mapping.', owner: 'MAPPING_OWNER' }));
  return id;
}

export const wecomContacts = { get, find, provision, update, enumerate, departmentNumber };

type ProvisionParams = WecomRuntime & { userid: string; mobile?: string; email?: string; name: string; departmentId: string; jobTitle?: string };
type UpdateParams = WecomRuntime & { userid: string; departmentId?: string; jobTitle?: string; managerId?: string; enable?: number };
