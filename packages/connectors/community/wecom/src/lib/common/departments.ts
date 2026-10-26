import { HttpMethod } from '@fema-ipaas/connector-common';
import { fixOwnerMarker, isObject, tryCatch } from '@fema-ipaas/connector-sdk';
import { wecomCommon, WecomRuntime } from './index';
import { wecomContacts } from './contacts';
import { WecomError } from './error-table';

async function get({ departmentId, ...runtime }: WecomRuntime & { departmentId: string }): Promise<Record<string, unknown>> {
  const result = await wecomCommon.callApi({ ...runtime, path: '/cgi-bin/department/get', query: { id: String(wecomContacts.departmentNumber(departmentId)) } });
  if (!isObject(result['department'])) throw new Error('WeCom returned no department');
  return { ...result['department'], id: String(result['department']['id']), parentid: String(result['department']['parentid']), parentId: String(result['department']['parentid']), customId: null };
}

async function list({ rootDepartmentId = '1', ...runtime }: WecomRuntime & { rootDepartmentId?: string }): Promise<Record<string, unknown>[]> {
  const result = await wecomCommon.callApi({ ...runtime, path: '/cgi-bin/department/simplelist', query: { id: String(wecomContacts.departmentNumber(rootDepartmentId)) } });
  const rows = result['department_id'];
  if (!Array.isArray(rows) || !rows.every(isObject) || rows.length > 20000) throw new Error('Invalid or oversized WeCom department tree');
  return rows;
}

async function upsert({ targetDepartmentId, name, parentDepartmentId, order, ...runtime }: WecomRuntime & { targetDepartmentId?: string; name: string; parentDepartmentId: string; order?: number }): Promise<Record<string, unknown>> {
  const parentid = wecomContacts.departmentNumber(parentDepartmentId);
  const { data: bound, error } = targetDepartmentId ? await tryCatch(() => get({ ...runtime, departmentId: targetDepartmentId })) : { data: null, error: null };
  if (error && !(error instanceof WecomError && [60003, 60123].includes(error.code))) throw error;
  const siblings = bound ? [] : (await list(runtime)).filter((row) => String(row['parentid']) === String(parentid));
  const matches: Record<string, unknown>[] = [];
  for (const row of siblings) {
    const department = await get({ ...runtime, departmentId: String(row['id']) });
    if (department['name'] === name) matches.push(department);
  }
  if (matches.length > 1) throw new Error(fixOwnerMarker.attach({ message: 'Several WeCom departments have this name under the same parent. Bind the correct department explicitly.', owner: 'MAPPING_OWNER' }));
  const existing = bound ?? matches[0];
  if (existing) {
    const desired = { name, parentid, ...(order !== undefined ? { order } : {}) };
    const changes = Object.fromEntries(Object.entries(desired).filter(([key, value]) => String(existing[key]) !== String(value)));
    if (Object.keys(changes).length) await wecomCommon.callApi({ ...runtime, purpose: 'contact', method: HttpMethod.POST, path: '/cgi-bin/department/update', write: true, body: { id: Number(existing['id']), ...changes } });
    return { ...existing, ...desired, id: String(existing['id']), created: false };
  }
  const result = await wecomCommon.callApi({ ...runtime, purpose: 'contact', method: HttpMethod.POST, path: '/cgi-bin/department/create', write: true, body: { name, parentid, ...(order !== undefined ? { order } : {}) } });
  if (typeof result['id'] !== 'number' || !Number.isSafeInteger(result['id'])) throw new Error('WeCom returned no created department ID');
  return { id: String(result['id']), name, parentid: String(parentid), created: true };
}

export const wecomDepartments = { get, list, upsert };
