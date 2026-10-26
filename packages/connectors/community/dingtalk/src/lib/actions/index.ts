import { createHmac } from 'node:crypto';
import { httpClient, HttpMethod } from '@fema-ipaas/connector-common';
import { createAction, fixOwnerMarker, isObject, Property, tryCatch } from '@fema-ipaas/connector-sdk';
import { dingtalkAuth } from '../auth';
import { dingtalkCommon } from '../common';
import { dingtalkContacts } from '../common/contacts';
import { dingtalkDepartments } from '../common/departments';
import { dingtalkErrorTable } from '../common/error-table';

function buildActions() {
const getUser = createAction({
  auth: dingtalkAuth, name: 'get_user', displayName: 'Get member', description: 'Read current member details', classification: 'READ', reliability: { rateLimits: READ_LIMITS },
  props: { userid: Property.ShortText({ displayName: 'User ID', required: true }) }, outputSchema: USER_SCHEMA,
  async run(context) { return dingtalkContacts.get({ ...context.propsValue, auth: context.auth.props, rateLimit: context.rateLimit }); },
});
const findUser = createAction({
  auth: dingtalkAuth, name: 'find_user', displayName: 'Find member', description: 'Find a member by stable employee user ID or mobile number', classification: 'READ', reliability: { rateLimits: READ_LIMITS }, props: { userid: Property.ShortText({ displayName: 'User ID', required: false }), mobile: Property.ShortText({ displayName: 'Mobile', required: false }) }, outputSchema: USER_SCHEMA,
  async run(context) {
    const runtime = { auth: context.auth.props, rateLimit: context.rateLimit };
    const { userid, mobile } = context.propsValue;
    const result = await tryCatch(() => userid ? dingtalkContacts.get({ ...runtime, userid }) : dingtalkContacts.find({ ...runtime, mobile: mobile ?? '' }));
    if (result.error && !dingtalkCommon.missing(result.error)) throw result.error;
    return result.data ? { ...result.data, found: true } : { found: false, userid: null };
  },
});
const provisionUser = createAction({
  auth: dingtalkAuth, name: 'provision_user', displayName: 'Provision member', description: 'Look up the stable employee user ID before creating a member', classification: 'WRITE', reliability: { writeSafety: 'LOOKUP_BEFORE_WRITE', lookupKeys: ['userid', 'mobile'], readBack: { actionName: 'get_user', aspects: ['department'] }, rateLimits: ALL_LIMITS }, aiMetadata: { idempotent: true },
  props: { userid: Property.ShortText({ displayName: 'User ID (employee number)', required: true }), name: Property.ShortText({ displayName: 'Name', required: true }), mobile: Property.ShortText({ displayName: 'Mobile', required: true }), email: Property.ShortText({ displayName: 'Email', required: false }), departmentId: Property.ShortText({ displayName: 'Department ID', required: true }), jobTitle: Property.ShortText({ displayName: 'Job title', required: false }) }, outputSchema: USER_SCHEMA,
  async run(context) { return dingtalkContacts.provision({ ...context.propsValue, auth: context.auth.props, rateLimit: context.rateLimit }); },
});
const updateUser = createAction({
  auth: dingtalkAuth, name: 'update_user', displayName: 'Update member', description: 'Set the member department, position or direct manager', classification: 'WRITE', reliability: { writeSafety: 'IDEMPOTENT', readBack: { actionName: 'get_user', aspects: ['department'] }, rateLimits: ALL_LIMITS }, aiMetadata: { idempotent: true },
  props: { userid: Property.ShortText({ displayName: 'User ID', required: true }), departmentId: Property.ShortText({ displayName: 'Department ID', required: false }), jobTitle: Property.ShortText({ displayName: 'Job title', required: false }), managerId: Property.ShortText({ displayName: 'Direct manager user ID', required: false }) }, outputSchema: USER_SCHEMA,
  async run(context) { return dingtalkContacts.update({ ...context.propsValue, auth: context.auth.props, rateLimit: context.rateLimit }); },
});
const suspendUser = createAction({ auth: dingtalkAuth, name: 'suspend_user', displayName: 'Move to pending resignation', description: 'Move a member without deleting or disabling the account. Send an administrator work notice in the next workflow step.', classification: 'WRITE', reliability: { writeSafety: 'IDEMPOTENT', readBack: { actionName: 'get_user', aspects: ['department'] }, rateLimits: ALL_LIMITS }, aiMetadata: { idempotent: true }, props: { userid: Property.ShortText({ displayName: 'User ID', required: true }), pendingDepartmentId: Property.ShortText({ displayName: 'Pending resignation department', required: true }) }, async run(context) { await dingtalkContacts.update({ auth: context.auth.props, rateLimit: context.rateLimit, userid: context.propsValue.userid, departmentId: context.propsValue.pendingDepartmentId }); return { userid: context.propsValue.userid, moved: true, suspended: false, pendingAdminAction: 'RESIGN' }; } });

const enumerateUsers = createAction({
  auth: dingtalkAuth, name: 'enumerate_users', displayName: 'Enumerate members', description: 'Enumerate all departments and their members with compound department and member cursors', classification: 'SEARCH', reliability: { enumeration: { entity: 'EMPLOYEE', businessKeyPath: 'employee_no' }, rateLimits: READ_LIMITS },
  props: { ...PAGE_PROPS, rootDepartmentId: Property.ShortText({ displayName: 'Root department ID', required: true, defaultValue: '1' }), pendingDepartmentId: Property.ShortText({ displayName: 'Pending resignation department', required: false }) }, outputSchema: { fields: [{ key: 'items', listItems: USER_SCHEMA.fields }, { key: 'nextPageToken' }] },
  async run(context) { const page = await dingtalkContacts.enumerate({ ...context.propsValue, auth: context.auth.props, rateLimit: context.rateLimit }); return { ...page, items: page.items.map((user) => ({ ...user, pending_resignation: Array.isArray(user['department_ids']) && user['department_ids'].includes(context.propsValue.pendingDepartmentId) })) }; },
});
const getDepartment = createAction({
  auth: dingtalkAuth, name: 'get_department', displayName: 'Get department', description: 'Read a department by its numeric ID', classification: 'READ', reliability: { rateLimits: READ_LIMITS },
  props: { departmentId: Property.ShortText({ displayName: 'Department ID', required: true }) }, outputSchema: DEPARTMENT_SCHEMA,
  async run(context) { return dingtalkDepartments.get({ ...context.propsValue, auth: context.auth.props, rateLimit: context.rateLimit }); },
});
const upsertDepartment = createAction({
  auth: dingtalkAuth, name: 'upsert_department', displayName: 'Create or update department', description: 'Find by the mapped ID or the same name under the parent before creating', classification: 'WRITE', reliability: { writeSafety: 'LOOKUP_BEFORE_WRITE', lookupKeys: ['customDepartmentId'], readBack: { actionName: 'get_department', aspects: ['name', 'parent'] }, rateLimits: ALL_LIMITS }, aiMetadata: { idempotent: true },
  props: { customDepartmentId: Property.ShortText({ displayName: 'Source identifier', required: true }), targetDepartmentId: Property.ShortText({ displayName: 'Mapped department ID', required: false }), name: Property.ShortText({ displayName: 'Name', required: true }), parentDepartmentId: Property.ShortText({ displayName: 'Parent department ID', required: true }), order: Property.Number({ displayName: 'Order', required: false }) }, outputSchema: DEPARTMENT_SCHEMA,
  async run(context) { return dingtalkDepartments.upsert({ ...context.propsValue, auth: context.auth.props, rateLimit: context.rateLimit }); },
});
const archiveDepartment = createAction({
  auth: dingtalkAuth, name: 'archive_department', displayName: 'Archive department', description: 'Move a department under an archive parent without deleting it', classification: 'WRITE', reliability: { writeSafety: 'IDEMPOTENT', readBack: { actionName: 'get_department', aspects: ['parent'] }, rateLimits: ALL_LIMITS }, aiMetadata: { idempotent: true },
  props: { departmentId: Property.ShortText({ displayName: 'Department ID', required: true }), archiveParentId: Property.ShortText({ displayName: 'Archive parent ID', required: true }) }, outputSchema: DEPARTMENT_SCHEMA,
  async run(context) {
    const runtime = { auth: context.auth.props, rateLimit: context.rateLimit };
    const id = dingtalkDepartments.idNumber(context.propsValue.departmentId);
    const parentid = dingtalkDepartments.idNumber(context.propsValue.archiveParentId);
    if (id === 1 || id === parentid) throw new Error('Cannot archive the root or move a department into itself');
    await dingtalkCommon.callApi({ ...runtime, path: '/topapi/v2/department/update', write: true, body: { dept_id: id, parent_id: parentid } });
    return dingtalkDepartments.get({ ...runtime, departmentId: String(id) });
  },
});
const enumerateDepartments = createAction({
  auth: dingtalkAuth, name: 'enumerate_departments', displayName: 'Enumerate departments', description: 'Enumerate the complete tree below a department', classification: 'SEARCH', reliability: { enumeration: { entity: 'DEPARTMENT', businessKeyPath: 'id' }, rateLimits: READ_LIMITS },
  props: { ...PAGE_PROPS, rootDepartmentId: Property.ShortText({ displayName: 'Root department ID', required: true, defaultValue: '1' }), allPages: Property.Checkbox({ displayName: 'Read the entire tree', required: false, defaultValue: false }) }, outputSchema: { fields: [{ key: 'items', listItems: DEPARTMENT_SCHEMA.fields }, { key: 'nextPageToken' }] },
  async run(context) {
    const runtime = { auth: context.auth.props, rateLimit: context.rateLimit };
    const all = await dingtalkDepartments.list({ ...runtime, rootDepartmentId: context.propsValue.rootDepartmentId });
    const offset = Number(context.propsValue.pageToken ?? 0);
    const size = context.propsValue.allPages ? all.length : Math.min(300, Math.max(1, context.propsValue.pageSize));
    if (!Number.isSafeInteger(offset) || offset < 0 || context.propsValue.allPages && all.length > 5000) throw new Error('Invalid or oversized department page');
    const items = [];
    for (const row of all.slice(offset, offset + size)) items.push(row);
    return { items, nextPageToken: offset + size < all.length ? String(offset + size) : null };
  },
});
const sendWorkNotice = createAction({
  auth: dingtalkAuth, name: 'send_work_notice', displayName: 'Send work notice', description: 'Send an application work notice. Check and record a notification key in the workflow to suppress successful repeats; uncertain failures require review.', classification: 'WRITE', reliability: { writeSafety: 'UNSAFE', rateLimits: ALL_LIMITS }, aiMetadata: { idempotent: false },
  props: { userid: Property.ShortText({ displayName: 'Recipient user IDs', description: 'Comma-separated, up to 100 members', required: true }), content: Property.LongText({ displayName: 'Text', required: true }) },
  async run(context) {
    const auth = context.auth.props;
    if (!auth.agentId) throw new Error(fixOwnerMarker.attach({ message: 'Configure the application Agent ID to send work notices.', owner: 'CONNECTION_OWNER' }));
    if (context.propsValue.userid.split(',').length > 100 || Buffer.byteLength(context.propsValue.content) > 2048) throw new Error('A work notice supports at most 100 recipients and 2048 text bytes');
    return dingtalkCommon.callApi({ auth, rateLimit: context.rateLimit, path: '/topapi/message/corpconversation/asyncsend_v2', write: true, body: { agent_id: dingtalkDepartments.idNumber(auth.agentId), userid_list: context.propsValue.userid, to_all_user: false, msg: { msgtype: 'text', text: { content: context.propsValue.content } } } });
  },
});
const sendGroupRobotMessage = createAction({
  auth: dingtalkAuth, name: 'send_group_robot_message', displayName: 'Send group robot message', description: 'Send text through a signed custom robot webhook', classification: 'WRITE', reliability: { writeSafety: 'UNSAFE', rateLimits: [{ bucket: 'dingtalk-robot', scope: 'APP', perSecond: 0.25 }] }, aiMetadata: { idempotent: false },
  props: { content: Property.LongText({ displayName: 'Text', required: true }) },
  async run(context) {
    const { robotToken, robotSecret, appKey } = context.auth.props;
    if (!robotToken || !robotSecret) throw new Error(fixOwnerMarker.attach({ message: 'Configure the robot access token and signing secret.', owner: 'CONNECTION_OWNER' }));
    await context.rateLimit.acquire({ bucket: 'dingtalk-robot', scopeKey: appKey });
    const timestamp = String(Date.now());
    const sign = createHmac('sha256', robotSecret).update(`${timestamp}\n${robotSecret}`).digest('base64');
    const response = await httpClient.sendRequest({ method: HttpMethod.POST, url: `${dingtalkCommon.baseUrl({ modern: false })}/robot/send`, queryParams: { access_token: robotToken, timestamp, sign }, body: { msgtype: 'text', text: { content: context.propsValue.content } }, timeout: 30000 });
    if (!isObject(response.body) || String(response.body['errcode']) !== '0') throw dingtalkErrorTable.error(dingtalkCommon.codeOf(response.body));
    return response.body;
  },
});

  return [getUser, findUser, provisionUser, updateUser, suspendUser, enumerateUsers, getDepartment, upsertDepartment, archiveDepartment, enumerateDepartments, sendWorkNotice, sendGroupRobotMessage];
}

const READ_LIMITS = [{ bucket: 'dingtalk-read', scope: 'APP_ENDPOINT', perSecond: 10 }] satisfies { bucket: string; scope: 'APP_ENDPOINT'; perSecond: number }[];
const ALL_LIMITS = [...READ_LIMITS, { bucket: 'dingtalk-write', scope: 'APP_ENDPOINT', perSecond: 1 }] satisfies { bucket: string; scope: 'APP_ENDPOINT'; perSecond: number }[];
const PAGE_PROPS = { pageToken: Property.ShortText({ displayName: 'Page token', required: false }), pageSize: Property.Number({ displayName: 'Page size', required: true, defaultValue: 100 }) };
const USER_SCHEMA = { fields: ['found', 'userid', 'employee_no', 'name', 'mobile', 'email', 'department_ids', 'active', 'pendingAdminAction', 'created'].map((key) => ({ key })) };
const DEPARTMENT_SCHEMA = { fields: ['id', 'name', 'parentId', 'order', 'created'].map((key) => ({ key })) };

export const dingtalkActions = buildActions();
