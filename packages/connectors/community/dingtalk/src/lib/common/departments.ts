import { fixOwnerMarker, tryCatch } from '@fema-ipaas/connector-sdk';
import { dingtalkCommon, DingtalkRuntime } from './index';
import { DingtalkError } from './error-table';

async function get({ departmentId, ...runtime }: DingtalkRuntime & { departmentId: string }): Promise<Record<string, unknown>> {
  const result = await dingtalkCommon.callApi({ ...runtime, path: '/topapi/v2/department/get', body: { dept_id: idNumber(departmentId) } });
  if (typeof result['name'] !== 'string' || !Number.isSafeInteger(Number(result['dept_id']))) throw new Error('Invalid DingTalk department');
  return { ...result, id: String(result['dept_id']), parentId: String(result['parent_id'] ?? 0), customId: typeof result['source_identifier'] === 'string' ? result['source_identifier'] : null };
}

async function list({ rootDepartmentId = '1', ...runtime }: DingtalkRuntime & { rootDepartmentId?: string }): Promise<Record<string, unknown>[]> {
  const rows = [await get({ ...runtime, departmentId: rootDepartmentId })];
  const seen = new Set([rootDepartmentId]);
  for (let index = 0; index < rows.length; index++) {
    const page = await dingtalkCommon.callApi({ ...runtime, path: '/topapi/v2/department/listsubid', body: { dept_id: idNumber(String(rows[index]['id'])) } });
    if (!Array.isArray(page['dept_id_list'])) throw new Error('Invalid DingTalk subdepartment list');
    for (const value of page['dept_id_list']) {
      const id = String(value);
      idNumber(id);
      if (seen.has(id)) throw new Error('DingTalk returned a cyclic or duplicate department tree');
      if (seen.size >= 5000) throw new Error('DingTalk department tree exceeds 5000 departments');
      seen.add(id);
      rows.push(await get({ ...runtime, departmentId: id }));
    }
  }
  return rows;
}

async function upsert({ targetDepartmentId, customDepartmentId, name, parentDepartmentId, order, ...runtime }: UpsertParams): Promise<Record<string, unknown>> {
  const parent_id = idNumber(parentDepartmentId);
  const bound = targetDepartmentId ? await tryCatch(() => get({ ...runtime, departmentId: targetDepartmentId })) : { data: null, error: null };
  if (bound.error && !(bound.error instanceof DingtalkError && bound.error.code === '60003')) throw bound.error;
  const rows = bound.data ? [] : await list(runtime);
  const candidates = rows.filter((row) => row['customId'] === customDepartmentId);
  const matches = candidates.length ? candidates : rows.filter((row) => row['parentId'] === parentDepartmentId && row['name'] === name);
  if (matches.length > 1) throw new Error(fixOwnerMarker.attach({ message: 'Multiple DingTalk departments match this source identifier or sibling name. Bind one department explicitly.', owner: 'MAPPING_OWNER' }));
  const existing = bound.data ?? matches[0];
  const desired = { name, parent_id, source_identifier: customDepartmentId, ...(order !== undefined ? { order } : {}) };
  if (existing) {
    const changes = Object.fromEntries(Object.entries(desired).filter(([key, value]) => String(existing[key]) !== String(value)));
    if (Object.keys(changes).length) await dingtalkCommon.callApi({ ...runtime, path: '/topapi/v2/department/update', write: true, body: { dept_id: idNumber(String(existing['id'])), ...changes } });
    return { ...existing, ...desired, parentId: parentDepartmentId, customId: customDepartmentId, created: false };
  }
  await get({ ...runtime, departmentId: parentDepartmentId });
  const result = await dingtalkCommon.callApi({ ...runtime, path: '/topapi/v2/department/create', write: true, body: desired });
  const id = idNumber(String(result['dept_id']));
  return { id: String(id), customId: customDepartmentId, name, parentId: parentDepartmentId, created: true };
}

function idNumber(id: string): number { const value = Number(id); if (!Number.isSafeInteger(value) || value < 1) throw new Error(fixOwnerMarker.attach({ message: 'DingTalk department IDs must be positive integers. Check the department mapping.', owner: 'MAPPING_OWNER' })); return value; }

export const dingtalkDepartments = { get, list, upsert, idNumber };
type UpsertParams = DingtalkRuntime & { targetDepartmentId?: string; customDepartmentId: string; name: string; parentDepartmentId: string; order?: number };
