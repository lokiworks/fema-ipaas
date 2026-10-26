import { httpClient, HttpMethod } from '@fema-ipaas/connector-common';
import { createAction, fixOwnerMarker, isObject, Property, tryCatch } from '@fema-ipaas/connector-sdk';
import { wecomAuth } from '../auth';
import { wecomCommon } from '../common';
import { wecomContacts } from '../common/contacts';
import { wecomDepartments } from '../common/departments';
import { wecomErrorTable } from '../common/error-table';

function buildActions() {
const getUser = createAction({
  auth: wecomAuth, name: 'get_user', displayName: 'Get member', description: 'Read a member using the application Secret', classification: 'READ', reliability: { rateLimits: READ_LIMITS },
  props: { userid: Property.ShortText({ displayName: 'User ID', required: true }) }, outputSchema: USER_SCHEMA,
  async run(context) { return wecomContacts.get({ ...context.propsValue, auth: context.auth.props, rateLimit: context.rateLimit }); },
});
const findUser = createAction({
  auth: wecomAuth, name: 'find_user', displayName: 'Find member', description: 'Find a member by stable employee user ID or mobile number', classification: 'READ', reliability: { rateLimits: READ_LIMITS }, props: { userid: Property.ShortText({ displayName: 'User ID', required: false }), mobile: Property.ShortText({ displayName: 'Mobile', required: false }) }, outputSchema: USER_SCHEMA,
  async run(context) {
    const runtime = { auth: context.auth.props, rateLimit: context.rateLimit };
    const { userid, mobile } = context.propsValue;
    const result = await tryCatch(() => userid ? wecomContacts.get({ ...runtime, userid }) : wecomContacts.find({ ...runtime, mobile: mobile ?? '' }));
    if (result.error && !wecomCommon.missing(result.error)) throw result.error;
    return result.data ? { ...result.data, found: true } : { found: false, userid: null };
  },
});
const provisionUser = createAction({
  auth: wecomAuth, name: 'provision_user', displayName: 'Provision member', description: 'Look up the stable employee user ID before creating a member', classification: 'WRITE', reliability: { writeSafety: 'LOOKUP_BEFORE_WRITE', lookupKeys: ['userid', 'mobile'], readBack: { actionName: 'get_user', aspects: ['department'] }, rateLimits: ALL_LIMITS }, aiMetadata: { idempotent: true },
  props: { userid: Property.ShortText({ displayName: 'User ID (employee number)', required: true }), name: Property.ShortText({ displayName: 'Name', required: true }), mobile: Property.ShortText({ displayName: 'Mobile', required: false }), email: Property.ShortText({ displayName: 'Email', required: false }), departmentId: Property.ShortText({ displayName: 'Department ID', required: true }), jobTitle: Property.ShortText({ displayName: 'Job title', required: false }) }, outputSchema: USER_SCHEMA,
  async run(context) { return wecomContacts.provision({ ...context.propsValue, auth: context.auth.props, rateLimit: context.rateLimit }); },
});
const updateUser = createAction({
  auth: wecomAuth, name: 'update_user', displayName: 'Update member', description: 'Set the member department, position or direct manager', classification: 'WRITE', reliability: { writeSafety: 'IDEMPOTENT', readBack: { actionName: 'get_user', aspects: ['department'] }, rateLimits: ALL_LIMITS }, aiMetadata: { idempotent: true },
  props: { userid: Property.ShortText({ displayName: 'User ID', required: true }), departmentId: Property.ShortText({ displayName: 'Department ID', required: false }), jobTitle: Property.ShortText({ displayName: 'Job title', required: false }), managerId: Property.ShortText({ displayName: 'Direct manager user ID', required: false }) }, outputSchema: USER_SCHEMA,
  async run(context) { return wecomContacts.update({ ...context.propsValue, auth: context.auth.props, rateLimit: context.rateLimit }); },
});
const suspendUser = stateAction({ suspend: true });
const resumeUser = stateAction({ suspend: false });
const enumerateUsers = createAction({
  auth: wecomAuth, name: 'enumerate_users', displayName: 'Enumerate members', description: 'Enumerate member IDs with the contact Secret and read details using the application Secret', classification: 'SEARCH', reliability: { enumeration: { entity: 'EMPLOYEE', businessKeyPath: 'userid' }, rateLimits: READ_LIMITS },
  props: PAGE_PROPS, outputSchema: { fields: [{ key: 'items', listItems: USER_SCHEMA.fields }, { key: 'nextPageToken' }] },
  async run(context) { return wecomContacts.enumerate({ ...context.propsValue, auth: context.auth.props, rateLimit: context.rateLimit }); },
});
const getDepartment = createAction({
  auth: wecomAuth, name: 'get_department', displayName: 'Get department', description: 'Read a department by its numeric ID', classification: 'READ', reliability: { rateLimits: READ_LIMITS },
  props: { departmentId: Property.ShortText({ displayName: 'Department ID', required: true }) }, outputSchema: DEPARTMENT_SCHEMA,
  async run(context) { return wecomDepartments.get({ ...context.propsValue, auth: context.auth.props, rateLimit: context.rateLimit }); },
});
const upsertDepartment = createAction({
  auth: wecomAuth, name: 'upsert_department', displayName: 'Create or update department', description: 'Find by the mapped ID or the same name under the parent before creating', classification: 'WRITE', reliability: { writeSafety: 'LOOKUP_BEFORE_WRITE', lookupKeys: ['name', 'parentDepartmentId'], readBack: { actionName: 'get_department', aspects: ['name', 'parent'] }, rateLimits: ALL_LIMITS }, aiMetadata: { idempotent: true },
  props: { targetDepartmentId: Property.ShortText({ displayName: 'Mapped department ID', required: false }), name: Property.ShortText({ displayName: 'Name', required: true }), parentDepartmentId: Property.ShortText({ displayName: 'Parent department ID', required: true }), order: Property.Number({ displayName: 'Order', required: false }) }, outputSchema: DEPARTMENT_SCHEMA,
  async run(context) { return wecomDepartments.upsert({ ...context.propsValue, auth: context.auth.props, rateLimit: context.rateLimit }); },
});
const archiveDepartment = createAction({
  auth: wecomAuth, name: 'archive_department', displayName: 'Archive department', description: 'Move a department under an archive parent without deleting it', classification: 'WRITE', reliability: { writeSafety: 'IDEMPOTENT', readBack: { actionName: 'get_department', aspects: ['parent'] }, rateLimits: ALL_LIMITS }, aiMetadata: { idempotent: true },
  props: { departmentId: Property.ShortText({ displayName: 'Department ID', required: true }), archiveParentId: Property.ShortText({ displayName: 'Archive parent ID', required: true }) }, outputSchema: DEPARTMENT_SCHEMA,
  async run(context) {
    const runtime = { auth: context.auth.props, rateLimit: context.rateLimit };
    const id = wecomContacts.departmentNumber(context.propsValue.departmentId);
    const parentid = wecomContacts.departmentNumber(context.propsValue.archiveParentId);
    if (id === 1 || id === parentid) throw new Error('Cannot archive the root or move a department into itself');
    await wecomCommon.callApi({ ...runtime, purpose: 'contact', method: HttpMethod.POST, path: '/cgi-bin/department/update', write: true, body: { id, parentid } });
    return wecomDepartments.get({ ...runtime, departmentId: String(id) });
  },
});
const enumerateDepartments = createAction({
  auth: wecomAuth, name: 'enumerate_departments', displayName: 'Enumerate departments', description: 'Enumerate the complete tree below a department', classification: 'SEARCH', reliability: { enumeration: { entity: 'DEPARTMENT', businessKeyPath: 'id' }, rateLimits: READ_LIMITS },
  props: { ...PAGE_PROPS, rootDepartmentId: Property.ShortText({ displayName: 'Root department ID', required: true, defaultValue: '1' }), allPages: Property.Checkbox({ displayName: 'Read the entire tree', required: false, defaultValue: false }) }, outputSchema: { fields: [{ key: 'items', listItems: DEPARTMENT_SCHEMA.fields }, { key: 'nextPageToken' }] },
  async run(context) {
    const runtime = { auth: context.auth.props, rateLimit: context.rateLimit };
    const all = await wecomDepartments.list({ ...runtime, rootDepartmentId: context.propsValue.rootDepartmentId });
    const offset = Number(context.propsValue.pageToken ?? 0);
    const size = context.propsValue.allPages ? all.length : Math.min(300, Math.max(1, context.propsValue.pageSize));
    if (!Number.isSafeInteger(offset) || offset < 0 || context.propsValue.allPages && all.length > 5000) throw new Error('Invalid or oversized department page');
    const items = [];
    for (const row of all.slice(offset, offset + size)) items.push(await wecomDepartments.get({ ...runtime, departmentId: String(row['id']) }));
    return { items, nextPageToken: offset + size < all.length ? String(offset + size) : null };
  },
});
const sendAppMessage = createAction({
  auth: wecomAuth, name: 'send_app_message', displayName: 'Send application message', description: 'Send a text message to application members; duplicate checking compares message content', classification: 'WRITE', reliability: { writeSafety: 'UNSAFE', dedupeKeyProp: 'dedupeKey', dedupeWindowSeconds: 14400, rateLimits: ALL_LIMITS }, aiMetadata: { idempotent: false },
  props: { userid: Property.ShortText({ displayName: 'Recipient user IDs', description: 'Separate user IDs with |', required: true }), content: Property.LongText({ displayName: 'Text', required: true }), dedupeKey: Property.ShortText({ displayName: 'Deduplication key', description: 'Keep recipient and content unchanged for this key. WeCom suppresses identical content for four hours, including content sent under another key.', required: false }) },
  async run(context) {
    const auth = context.auth.props;
    if (!auth.agentId) throw new Error(fixOwnerMarker.attach({ message: 'Configure the application Agent ID to send messages.', owner: 'CONNECTION_OWNER' }));
    const result = await wecomCommon.callApi({ auth, rateLimit: context.rateLimit, method: HttpMethod.POST, path: '/cgi-bin/message/send', write: true, body: { touser: context.propsValue.userid, agentid: auth.agentId, msgtype: 'text', text: { content: context.propsValue.content }, ...(context.propsValue.dedupeKey ? { enable_duplicate_check: 1, duplicate_check_interval: 14400 } : {}) } });
    if (result['invaliduser'] || result['unlicenseduser']) throw new Error(fixOwnerMarker.attach({ message: 'Some recipients could not receive the message; other recipients may have received it. Review before resending.', owner: 'TARGET_ADMIN' }));
    return result;
  },
});
const sendGroupRobotMessage = createAction({
  auth: wecomAuth, name: 'send_group_robot_message', displayName: 'Send group robot message', description: 'Send text using a group robot webhook key', classification: 'WRITE', reliability: { writeSafety: 'UNSAFE', rateLimits: [{ bucket: 'wecom-robot', scope: 'APP', perSecond: 0.25 }] }, aiMetadata: { idempotent: false },
  props: { content: Property.LongText({ displayName: 'Text', required: true }) },
  async run(context) {
    if (!context.auth.props.robotKey) throw new Error(fixOwnerMarker.attach({ message: 'Configure the group robot webhook key in the connection.', owner: 'CONNECTION_OWNER' }));
    await context.rateLimit.acquire({ bucket: 'wecom-robot', scopeKey: context.auth.props.corpId });
    const result = await httpClient.sendRequest({ method: HttpMethod.POST, url: `${wecomCommon.baseUrl()}/cgi-bin/webhook/send`, queryParams: { key: context.auth.props.robotKey }, body: { msgtype: 'text', text: { content: context.propsValue.content } }, timeout: 30000 });
    if (!isObject(result.body) || result.body['errcode'] !== 0) throw wecomErrorTable.error({ code: isObject(result.body) && typeof result.body['errcode'] === 'number' ? result.body['errcode'] : -1 });
    return result.body;
  },
});

  return [getUser, findUser, provisionUser, updateUser, suspendUser, resumeUser, enumerateUsers, getDepartment, upsertDepartment, archiveDepartment, enumerateDepartments, sendAppMessage, sendGroupRobotMessage];
}

function stateAction({ suspend }: { suspend: boolean }) {
  return createAction({ auth: wecomAuth, name: suspend ? 'suspend_user' : 'resume_user', displayName: suspend ? 'Suspend member' : 'Resume member', description: 'Set the account enabled state without deleting the account', classification: 'WRITE', reliability: { writeSafety: 'IDEMPOTENT', readBack: { actionName: 'get_user', aspects: ['suspension'] }, rateLimits: ALL_LIMITS }, aiMetadata: { idempotent: true }, props: { userid: Property.ShortText({ displayName: 'User ID', required: true }) }, outputSchema: USER_SCHEMA, async run(context) { return wecomContacts.update({ auth: context.auth.props, rateLimit: context.rateLimit, userid: context.propsValue.userid, enable: suspend ? 0 : 1 }); } });
}

const READ_LIMITS = [{ bucket: 'wecom-read', scope: 'APP_ENDPOINT', perSecond: 10 }] satisfies { bucket: string; scope: 'APP_ENDPOINT'; perSecond: number }[];
const ALL_LIMITS = [...READ_LIMITS, { bucket: 'wecom-write', scope: 'APP_ENDPOINT', perSecond: 1 }] satisfies { bucket: string; scope: 'APP_ENDPOINT'; perSecond: number }[];
const PAGE_PROPS = { pageToken: Property.ShortText({ displayName: 'Page token', required: false }), pageSize: Property.Number({ displayName: 'Page size', required: true, defaultValue: 100 }) };
const USER_SCHEMA = { fields: ['found', 'userid', 'employee_no', 'name', 'mobile', 'email', 'department_ids', 'status', 'is_frozen', 'created'].map((key) => ({ key })) };
const DEPARTMENT_SCHEMA = { fields: ['id', 'name', 'parentid', 'order', 'created'].map((key) => ({ key })) };

export const wecomActions = buildActions();
